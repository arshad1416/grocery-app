if (typeof (global as any).WebAssembly === 'undefined') {
  const mockError = class extends Error {};
  (global as any).WebAssembly = {
    RuntimeError: mockError,
    CompileError: mockError,
    LinkError: mockError,
  };
}
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
