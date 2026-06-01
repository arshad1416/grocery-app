// react-native-get-random-values MUST be the first import — polyfills crypto.getRandomValues
// before any module (including libsodium) tries to use it during WASM initialization
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
