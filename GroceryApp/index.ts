// ─── Error handler MUST be first import (no deps → evaluates immediately) ───
import './src/error-handler';

import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
