// Entry point - bypasses Expo.fx that crashes on RN 0.85.3 + Hermes.
import './src/error-handler';

import { AppRegistry } from 'react-native';
import App from './App';

AppRegistry.registerComponent('main', () => App);
