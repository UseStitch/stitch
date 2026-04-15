import { AppleFMChatLanguageModel } from './apple-fm-chat-model.js';
import { isAvailable, checkAvailability } from './apple-fm-native.js';

export type AppleFMModelId = 'default' | (string & {});

export interface AppleFMProvider {
  (modelId: AppleFMModelId): AppleFMChatLanguageModel;
  languageModel(modelId: AppleFMModelId): AppleFMChatLanguageModel;
  isAvailable(): boolean;
}

/**
 * Creates an Apple FM provider instance.
 *
 * This provider interfaces with Apple's on-device Foundation Models
 * via native Swift/Rust bindings. No API key is required.
 *
 * Requirements: macOS 26+, Apple Silicon (ARM64).
 */
export function createAppleFM(): AppleFMProvider {
  const createModel = (modelId: AppleFMModelId): AppleFMChatLanguageModel => {
    if (!isAvailable()) {
      const availability = checkAvailability();
      throw new Error(
        `Apple Foundation Models not available: ${availability.reason}. ` +
          `Platform: ${process.platform}/${process.arch}`,
      );
    }
    return new AppleFMChatLanguageModel(modelId);
  };

  const provider = function (modelId: AppleFMModelId) {
    return createModel(modelId);
  } as AppleFMProvider;

  provider.languageModel = createModel;
  provider.isAvailable = isAvailable;

  return provider;
}
