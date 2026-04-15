use libc::{c_char, c_double, c_int};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi::JsString;
use napi_derive::napi;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::sync::{Mutex, OnceLock};

// -------- FFI declarations to Swift dylib --------
#[link(name = "appleai")]
extern "C" {
    fn apple_ai_init() -> bool;
    fn apple_ai_check_availability() -> c_int;
    fn apple_ai_get_availability_reason() -> *mut c_char;

    fn apple_ai_get_supported_languages_count() -> c_int;
    fn apple_ai_get_supported_language(index: c_int) -> *mut c_char;

    // Tool callback registration and tool-based generation
    fn apple_ai_register_tool_callback(
        cb: Option<extern "C" fn(u64, *const c_char) -> *mut c_char>,
    );
    fn apple_ai_tool_result_callback(tool_id: u64, result_json: *const c_char);

    // Unified generation function
    fn apple_ai_generate_unified(
        messages_json: *const c_char,
        tools_json: *const c_char,  // nullable
        schema_json: *const c_char, // nullable
        temperature: c_double,
        max_tokens: c_int,
        stream: bool,
        stop_after_tool_calls: bool,                    // new parameter
        on_chunk: Option<extern "C" fn(*const c_char)>, // nullable
    ) -> *mut c_char;
}

// --------------------------------------------------

/// Lazily ensure the Swift library is initialized exactly once.
fn ensure_initialized() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| unsafe {
        if !apple_ai_init() {
            panic!("Failed to initialize Apple AI native library");
        }
    });
}

#[napi(object)]
pub struct ModelAvailability {
    pub available: bool,
    pub reason: String,
}

#[inline(always)]
fn take_c_string(ptr: *mut c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe {
        let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        libc::free(ptr as *mut _);
        s
    }
}

#[napi]
pub fn check_availability() -> napi::Result<ModelAvailability> {
    ensure_initialized();
    unsafe {
        let status = apple_ai_check_availability();
        if status == 1 {
            Ok(ModelAvailability {
                available: true,
                reason: "Available".to_string(),
            })
        } else {
            let reason_ptr = apple_ai_get_availability_reason();
            let reason = take_c_string(reason_ptr);
            Ok(ModelAvailability {
                available: false,
                reason,
            })
        }
    }
}

#[napi]
pub fn get_supported_languages() -> napi::Result<Vec<String>> {
    ensure_initialized();
    unsafe {
        let count = apple_ai_get_supported_languages_count();
        let mut langs = Vec::with_capacity(count as usize);
        for i in 0..count {
            let lang_ptr = apple_ai_get_supported_language(i);
            if !lang_ptr.is_null() {
                let s = take_c_string(lang_ptr);
                langs.push(s);
            }
        }
        Ok(langs)
    }
}

// ---------------- Async generation tasks ----------------

const ERROR_SENTINEL: u8 = 0x02;

// ---------- Global tool handler state ----------

// Async tool dispatcher - like streaming
static TOOL_CALLBACK: OnceLock<
    Mutex<Option<ThreadsafeFunction<(u64, String), ErrorStrategy::CalleeHandled>>>,
> = OnceLock::new();
static TOOL_RESULTS: OnceLock<Mutex<HashMap<u64, std::sync::mpsc::Sender<String>>>> =
    OnceLock::new();

fn tool_callback(
) -> &'static Mutex<Option<ThreadsafeFunction<(u64, String), ErrorStrategy::CalleeHandled>>> {
    TOOL_CALLBACK.get_or_init(|| Mutex::new(None))
}

fn tool_results() -> &'static Mutex<HashMap<u64, std::sync::mpsc::Sender<String>>> {
    TOOL_RESULTS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[napi]
pub fn set_tool_callback(callback: JsFunction) -> napi::Result<()> {
    // Replace any existing callback atomically
    let tsfn: ThreadsafeFunction<(u64, String), ErrorStrategy::CalleeHandled> = callback
        .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<(u64, String)>| {
            let env = ctx.env;
            let (tool_id, args_json) = ctx.value;
            let js_tool_id = env.create_uint32(tool_id as u32)?;
            let js_args = env.create_string(&args_json)?;
            Ok(vec![js_tool_id.into_unknown(), js_args.into_unknown()])
        })?;

    let mut guard = tool_callback().lock().unwrap();
    if let Some(old) = guard.take() {
        let _ = old.abort();
    }
    *guard = Some(tsfn);
    Ok(())
}

#[napi]
pub fn clear_tool_callback() -> napi::Result<()> {
    let mut guard = tool_callback().lock().unwrap();
    if let Some(tsfn) = guard.take() {
        let _ = tsfn.abort();
    }
    Ok(())
}

#[napi]
pub fn tool_result(tool_id: f64, result_json: String) -> napi::Result<()> {
    // Notify Swift via the result callback
    unsafe {
        let tool_id_u64 = tool_id as u64;
        let c_result = CString::new(result_json.clone()).unwrap();
        apple_ai_tool_result_callback(tool_id_u64, c_result.as_ptr());
    }

    // Also notify our internal Rust channel for the blocking wait
    if let Some(sender) = tool_results().lock().unwrap().remove(&(tool_id as u64)) {
        let _ = sender.send(result_json);
    }
    Ok(())
}

fn ensure_tool_callback_registered() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| unsafe {
        apple_ai_register_tool_callback(Some(js_tool_dispatch));
    });
}

extern "C" fn js_tool_dispatch(_tool_id: u64, _args_json: *const c_char) -> *mut c_char {
    ensure_initialized();

    let args_json = unsafe {
        if _args_json.is_null() {
            "{}".to_string()
        } else {
            CStr::from_ptr(_args_json).to_string_lossy().into_owned()
        }
    };

    // Create channel for result
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    tool_results().lock().unwrap().insert(_tool_id, tx);

    // Call JS side async, swallow any error to avoid unwinding across FFI
    if let Some(ref tsfn) = *tool_callback().lock().unwrap() {
        let _ = std::panic::catch_unwind(|| {
            tsfn.call(
                Ok((_tool_id, args_json)),
                ThreadsafeFunctionCallMode::NonBlocking,
            )
        });
    }

    // Wait for result from separate JS callback
    let response = match rx.recv_timeout(std::time::Duration::from_secs(10)) {
        Ok(r) => r,
        Err(_) => {
            // remove dangling sender to avoid leak
            tool_results().lock().unwrap().remove(&_tool_id);
            "{}".to_string()
        }
    };
    CString::new(response).unwrap().into_raw()
}

// ---------------- Unified Generation ----------------

pub struct GenerateUnifiedTask {
    pub messages_json: String,
    pub tools_json: Option<String>,
    pub schema_json: Option<String>,
    pub temperature: f64,
    pub max_tokens: i32,
    pub stop_after_tool_calls: bool, // new field
}

impl napi::Task for GenerateUnifiedTask {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        ensure_initialized();
        if self.tools_json.is_some() {
            ensure_tool_callback_registered();
        }

        let c_messages = CString::new(self.messages_json.clone())
            .map_err(|_| napi::Error::from_reason("Messages contained null byte".to_string()))?;

        // Convert optional strings to nullable pointers
        let c_tools = self
            .tools_json
            .as_ref()
            .map(|s| CString::new(s.clone()))
            .transpose()
            .map_err(|_| napi::Error::from_reason("Tools JSON contained null byte".to_string()))?;

        let c_schema = self
            .schema_json
            .as_ref()
            .map(|s| CString::new(s.clone()))
            .transpose()
            .map_err(|_| napi::Error::from_reason("Schema JSON contained null byte".to_string()))?;

        unsafe {
            let result_ptr = apple_ai_generate_unified(
                c_messages.as_ptr(),
                c_tools.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()),
                c_schema.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()),
                self.temperature as c_double,
                self.max_tokens as c_int,
                false, // not streaming
                self.stop_after_tool_calls,
                None, // no callback for non-streaming
            );
            if result_ptr.is_null() {
                return Err(napi::Error::from_reason(
                    "Generation returned null".to_string(),
                ));
            }
            Ok(take_c_string(result_ptr))
        }
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        env.create_string(&output)
    }
}

#[napi]
pub fn generate_unified(
    messages_json: String,
    #[napi(ts_arg_type = "string | undefined | null")] tools_json: Option<String>,
    #[napi(ts_arg_type = "string | undefined | null")] schema_json: Option<String>,
    #[napi(ts_arg_type = "number | undefined")] temperature: Option<f64>,
    #[napi(ts_arg_type = "number | undefined")] max_tokens: Option<i32>,
    #[napi(ts_arg_type = "boolean | undefined")] stop_after_tool_calls: Option<bool>,
) -> napi::Result<AsyncTask<GenerateUnifiedTask>> {
    let task = GenerateUnifiedTask {
        messages_json,
        tools_json: tools_json.filter(|s| !s.is_empty()),
        schema_json: schema_json.filter(|s| !s.is_empty()),
        temperature: temperature.unwrap_or(0.0),
        max_tokens: max_tokens.unwrap_or(0),
        stop_after_tool_calls: stop_after_tool_calls.unwrap_or(true), // default to true
    };
    Ok(AsyncTask::new(task))
}

#[napi]
pub fn generate_unified_stream(
    messages_json: String,
    #[napi(ts_arg_type = "string | undefined | null")] tools_json: Option<String>,
    #[napi(ts_arg_type = "string | undefined | null")] schema_json: Option<String>,
    #[napi(ts_arg_type = "number | undefined")] temperature: Option<f64>,
    #[napi(ts_arg_type = "number | undefined")] max_tokens: Option<i32>,
    #[napi(ts_arg_type = "boolean | undefined")] stop_after_tool_calls: Option<bool>,
    callback: JsFunction,
) -> napi::Result<()> {
    ensure_initialized();
    if tools_json.is_some() {
        ensure_tool_callback_registered();
    }

    let ts_fn: ThreadsafeFunction<String, ErrorStrategy::CalleeHandled> = callback
        .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<String>| {
            let env = ctx.env;
            let js_string = env.create_string(&ctx.value)?;
            Ok(vec![js_string])
        })?;

    // Unified stream state
    struct UnifiedState {
        tsfn: ThreadsafeFunction<String, ErrorStrategy::CalleeHandled>,
        _messages: CString,
        _tools: Option<CString>,
        _schema: Option<CString>,
    }

    static UNIFIED_STREAM: OnceLock<Mutex<Option<UnifiedState>>> = OnceLock::new();
    let mutex = UNIFIED_STREAM.get_or_init(|| Mutex::new(None));

    let c_messages = CString::new(messages_json)?;
    let c_tools = tools_json
        .filter(|s| !s.is_empty())
        .map(|s| CString::new(s))
        .transpose()?;
    let c_schema = schema_json
        .filter(|s| !s.is_empty())
        .map(|s| CString::new(s))
        .transpose()?;

    {
        let mut guard = mutex.lock().unwrap();
        *guard = Some(UnifiedState {
            tsfn: ts_fn.clone(),
            _messages: c_messages.clone(),
            _tools: c_tools.clone(),
            _schema: c_schema.clone(),
        });
    }

    extern "C" fn unified_chunk_cb(ptr: *const c_char) {
        let mutex = UNIFIED_STREAM.get().unwrap();
        let mut guard = mutex.lock().unwrap();
        if let Some(state) = guard.as_mut() {
            if ptr.is_null() {
                // Send the end-of-stream signal to JavaScript
                let _ = state
                    .tsfn
                    .call(Ok(String::new()), ThreadsafeFunctionCallMode::NonBlocking);

                // Don't abort immediately - let the callback complete naturally
                // The cleanup will happen when the state is dropped
                *guard = None;
                return;
            }

            // Take ownership and free C string
            let slice_owned = take_c_string(ptr as *mut c_char);
            if slice_owned.is_empty() {
                return;
            }

            // Check for error sentinel
            let bytes = slice_owned.as_bytes();
            if !bytes.is_empty() && bytes[0] == ERROR_SENTINEL {
                let msg = String::from_utf8_lossy(&bytes[1..]).into_owned();
                let _ = state.tsfn.call(
                    Err(napi::Error::from_reason(msg)),
                    ThreadsafeFunctionCallMode::NonBlocking,
                );
                return;
            }

            let _ = state
                .tsfn
                .call(Ok(slice_owned), ThreadsafeFunctionCallMode::NonBlocking);
        }
    }

    unsafe {
        apple_ai_generate_unified(
            c_messages.as_ptr(),
            c_tools.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()),
            c_schema.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()),
            temperature.unwrap_or(0.0) as c_double,
            max_tokens.unwrap_or(0) as c_int,
            true,                                  // streaming
            stop_after_tool_calls.unwrap_or(true), // default to true
            Some(unified_chunk_cb),
        );
    }
    Ok(())
}
