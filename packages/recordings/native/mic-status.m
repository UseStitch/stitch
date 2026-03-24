/**
 * mic-status — macOS helper that prints which processes are currently capturing
 * microphone audio.
 *
 * Uses the CoreAudio HAL Process Object API (macOS 14.2+) with a fallback to
 * the device-level "running somewhere" check (macOS 12+).
 *
 * Output: JSON array on stdout.
 *
 *   Full mode (macOS 14.2+):
 *     [{"pid":1265,"name":"Slack Helper","bundleId":"com.tinyspeck.slackmacgap.helper"}, ...]
 *
 *   Fallback mode (macOS 12–14.1):
 *     [{"pid":0,"name":"unknown","bundleId":"unknown"}]   // mic is active, unknown process
 *     []                                                   // mic is not active
 *
 * Exit code 0 on success, 1 on error (with message on stderr).
 *
 * Compile:
 *   clang -o mic-status mic-status.m -framework CoreAudio -framework Foundation -O2
 */

#import <CoreAudio/CoreAudio.h>
#import <Foundation/Foundation.h>

// These selectors are available starting macOS 14.2.
// We define them locally so we can compile against earlier SDKs.
#ifndef kAudioHardwarePropertyProcessObjectList
#define kAudioHardwarePropertyProcessObjectList 'prs#'
#endif
#ifndef kAudioProcessPropertyPID
#define kAudioProcessPropertyPID 'ppid'
#endif
#ifndef kAudioProcessPropertyBundleID
#define kAudioProcessPropertyBundleID 'pbid'
#endif
#ifndef kAudioProcessPropertyIsRunningInput
#define kAudioProcessPropertyIsRunningInput 'piri'
#endif

/**
 * Try the full Process Object API (macOS 14.2+).
 * Returns YES if the API was available, NO otherwise.
 * On success, populates `results` with a JSON-compatible array.
 */
static BOOL queryProcessObjects(NSMutableArray *results) {
    AudioObjectPropertyAddress addr = {
        .mSelector = kAudioHardwarePropertyProcessObjectList,
        .mScope    = kAudioObjectPropertyScopeGlobal,
        .mElement  = kAudioObjectPropertyElementMain,
    };

    UInt32 dataSize = 0;
    OSStatus status = AudioObjectGetPropertyDataSize(
        kAudioObjectSystemObject, &addr, 0, NULL, &dataSize);

    if (status != noErr || dataSize == 0) {
        return NO; // API not available or no processes
    }

    UInt32 count = dataSize / sizeof(AudioObjectID);
    AudioObjectID *processIDs = (AudioObjectID *)malloc(dataSize);
    if (!processIDs) return NO;

    status = AudioObjectGetPropertyData(
        kAudioObjectSystemObject, &addr, 0, NULL, &dataSize, processIDs);
    if (status != noErr) {
        free(processIDs);
        return NO;
    }

    for (UInt32 i = 0; i < count; i++) {
        AudioObjectID processID = processIDs[i];

        // Check if this process is running input (capturing audio)
        AudioObjectPropertyAddress runningAddr = {
            .mSelector = kAudioProcessPropertyIsRunningInput,
            .mScope    = kAudioObjectPropertyScopeGlobal,
            .mElement  = kAudioObjectPropertyElementMain,
        };

        UInt32 isRunning = 0;
        UInt32 propSize = sizeof(isRunning);
        status = AudioObjectGetPropertyData(processID, &runningAddr, 0, NULL, &propSize, &isRunning);
        if (status != noErr || isRunning == 0) {
            continue;
        }

        // Get PID
        AudioObjectPropertyAddress pidAddr = {
            .mSelector = kAudioProcessPropertyPID,
            .mScope    = kAudioObjectPropertyScopeGlobal,
            .mElement  = kAudioObjectPropertyElementMain,
        };
        pid_t pid = 0;
        propSize = sizeof(pid);
        AudioObjectGetPropertyData(processID, &pidAddr, 0, NULL, &propSize, &pid);

        // Get Bundle ID
        AudioObjectPropertyAddress bundleAddr = {
            .mSelector = kAudioProcessPropertyBundleID,
            .mScope    = kAudioObjectPropertyScopeGlobal,
            .mElement  = kAudioObjectPropertyElementMain,
        };
        CFStringRef bundleRef = NULL;
        propSize = sizeof(bundleRef);
        AudioObjectGetPropertyData(processID, &bundleAddr, 0, NULL, &propSize, &bundleRef);
        NSString *bundleId = bundleRef ? (__bridge_transfer NSString *)bundleRef : @"unknown";

        // Derive process name from bundle ID (last component)
        NSString *name = [[bundleId componentsSeparatedByString:@"."] lastObject] ?: @"unknown";

        [results addObject:@{
            @"pid": @(pid),
            @"name": name,
            @"bundleId": bundleId,
        }];
    }

    free(processIDs);
    return YES;
}

/**
 * Fallback: check if any input device is running somewhere (macOS 12+).
 * Cannot attribute to a specific process.
 */
static BOOL isAnyInputDeviceRunning(void) {
    AudioObjectPropertyAddress devicesAddr = {
        .mSelector = kAudioHardwarePropertyDevices,
        .mScope    = kAudioObjectPropertyScopeGlobal,
        .mElement  = kAudioObjectPropertyElementMain,
    };

    UInt32 dataSize = 0;
    OSStatus status = AudioObjectGetPropertyDataSize(
        kAudioObjectSystemObject, &devicesAddr, 0, NULL, &dataSize);
    if (status != noErr || dataSize == 0) return NO;

    UInt32 deviceCount = dataSize / sizeof(AudioDeviceID);
    AudioDeviceID *devices = (AudioDeviceID *)malloc(dataSize);
    if (!devices) return NO;

    status = AudioObjectGetPropertyData(
        kAudioObjectSystemObject, &devicesAddr, 0, NULL, &dataSize, devices);
    if (status != noErr) {
        free(devices);
        return NO;
    }

    BOOL running = NO;
    for (UInt32 i = 0; i < deviceCount; i++) {
        // Check if this device has input streams
        AudioObjectPropertyAddress inputStreamsAddr = {
            .mSelector = kAudioDevicePropertyStreams,
            .mScope    = kAudioObjectPropertyScopeInput,
            .mElement  = kAudioObjectPropertyElementMain,
        };

        UInt32 streamSize = 0;
        status = AudioObjectGetPropertyDataSize(devices[i], &inputStreamsAddr, 0, NULL, &streamSize);
        if (status != noErr || streamSize == 0) continue; // Not an input device

        // Check if the device is running
        AudioObjectPropertyAddress runningAddr = {
            .mSelector = kAudioDevicePropertyDeviceIsRunningSomewhere,
            .mScope    = kAudioObjectPropertyScopeInput,
            .mElement  = kAudioObjectPropertyElementMain,
        };

        UInt32 isRunning = 0;
        UInt32 propSize = sizeof(isRunning);
        status = AudioObjectGetPropertyData(devices[i], &runningAddr, 0, NULL, &propSize, &isRunning);
        if (status == noErr && isRunning != 0) {
            running = YES;
            break;
        }
    }

    free(devices);
    return running;
}

int main(void) {
    @autoreleasepool {
        NSMutableArray *results = [NSMutableArray array];

        BOOL fullApiAvailable = queryProcessObjects(results);

        if (!fullApiAvailable) {
            // Fallback: we can only say "mic is active" or "mic is not active"
            if (isAnyInputDeviceRunning()) {
                [results addObject:@{
                    @"pid": @0,
                    @"name": @"unknown",
                    @"bundleId": @"unknown",
                }];
            }
        }

        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:results
                                                           options:0
                                                             error:&error];
        if (!jsonData) {
            fprintf(stderr, "JSON serialization failed: %s\n",
                    [[error localizedDescription] UTF8String]);
            return 1;
        }

        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        printf("%s\n", [jsonString UTF8String]);
        return 0;
    }
}
