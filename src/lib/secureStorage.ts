import * as SecureStore from "expo-secure-store";

/**
 * Key-value storage kept in the phone's keychain (iOS) or encrypted
 * preferences (Android). Values are small strings (SecureStore allows about
 * 2 KB each).
 */
export type KeyValueStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export const secureStorage: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
