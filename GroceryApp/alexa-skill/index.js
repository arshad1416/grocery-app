/**
 * Alexa Skill Lambda Handler — GroceryApp
 *
 * Intents:
 *   - AddItemIntent:   "Alexa, add milk to my grocery list"
 *   - GetListIntent:   "Alexa, what's on my grocery list?"
 *   - CheckOffIntent:  "Alexa, mark eggs as done"
 *
 * Architecture:
 *   This Lambda forwards requests to the GroceryApp relay server
 *   via HTTPS. The relay server authenticates the user via OAuth2
 *   token (account linking) and proxies the CRUD operations to Yjs.
 *
 * Account Linking:
 *   Alexa users link their GroceryApp account via the Alexa companion
 *   app. The skill uses OAuth2 with the relay server as the auth provider.
 */

const Alexa = require('ask-sdk');

// ─── Configuration ───────────────────────────────────────────────────────────

const RELAY_BASE_URL = process.env.RELAY_BASE_URL || 'https://relay.groceryapp.local';
const API_TIMEOUT = 5000; // 5 seconds

// ─── Helper: Call relay server ───────────────────────────────────────────────

async function callRelay(endpoint, payload, accessToken) {
  const https = require('https');

  return new Promise((resolve, reject) => {
    const url = new URL(`${RELAY_BASE_URL}${endpoint}`);
    const data = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      timeout: API_TIMEOUT,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ success: false, error: 'Invalid response' });
        }
      });
    });

    req.on('error', (err) =>
      reject(new Error(`Relay call failed: ${err.message}`)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Relay call timed out'));
    });

    req.write(data);
    req.end();
  });
}

// ─── Intent Handlers ─────────────────────────────────────────────────────────

const AddItemIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AddItemIntent'
    );
  },
  async handle(handlerInput) {
    const { requestEnvelope } = handlerInput;
    const slots = requestEnvelope.request.intent.slots;
    const accessToken = requestEnvelope.context.System.user.accessToken;

    if (!accessToken) {
      return handlerInput.responseBuilder
        .speak('Please link your GroceryApp account in the Alexa app to use this skill.')
        .withLinkAccountCard()
        .getResponse();
    }

    const itemName = slots.ItemName && slots.ItemName.value;
    const quantity = slots.Quantity ? parseInt(slots.Quantity.value, 10) || 1 : 1;
    const unit = slots.Unit ? slots.Unit.value : 'each';

    if (!itemName) {
      return handlerInput.responseBuilder
        .speak("I didn't catch what you want to add. Please try again.")
        .reprompt('What item would you like to add to your grocery list?')
        .getResponse();
    }

    try {
      await callRelay(
        '/api/alexa/add-item',
        {
          name: itemName,
          quantity,
          unit,
          source: 'alexa',
          timestamp: Date.now(),
        },
        accessToken,
      );

      const quantityText = quantity > 1 ? `${quantity} ${unit}` : '';
      const speech = quantityText
        ? `Added ${quantityText} of ${itemName} to your grocery list.`
        : `Added ${itemName} to your grocery list.`;

      return handlerInput.responseBuilder
        .speak(speech)
        .withSimpleCard('GroceryApp', speech)
        .getResponse();
    } catch (err) {
      console.error('[Alexa:AddItemIntent] Error:', err.message);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble adding that item. Please try again later.')
        .getResponse();
    }
  },
};

const GetListIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetListIntent'
    );
  },
  async handle(handlerInput) {
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;

    if (!accessToken) {
      return handlerInput.responseBuilder
        .speak('Please link your GroceryApp account in the Alexa app.')
        .withLinkAccountCard()
        .getResponse();
    }

    try {
      const result = await callRelay('/api/alexa/get-list', {}, accessToken);

      if (!result.items || result.items.length === 0) {
        return handlerInput.responseBuilder
          .speak('Your grocery list is empty.')
          .getResponse();
      }

      const items = result.items.slice(0, 10); // Alexa read limit
      const itemList = items
        .map((item) => `${item.name} (${item.quantity} ${item.unit})`)
        .join(', ');
      const speech = `Your grocery list has ${result.items.length} items: ${itemList}.`;

      return handlerInput.responseBuilder.speak(speech).getResponse();
    } catch (err) {
      console.error('[Alexa:GetListIntent] Error:', err.message);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble retrieving your list.')
        .getResponse();
    }
  },
};

const CheckOffIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'CheckOffIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;

    if (!accessToken) {
      return handlerInput.responseBuilder
        .speak('Please link your GroceryApp account in the Alexa app.')
        .withLinkAccountCard()
        .getResponse();
    }

    const itemName = slots.ItemName && slots.ItemName.value;

    if (!itemName) {
      return handlerInput.responseBuilder
        .speak("Which item would you like to check off?")
        .reprompt('Tell me the item name to check off.')
        .getResponse();
    }

    try {
      await callRelay(
        '/api/alexa/check-off',
        { name: itemName, timestamp: Date.now() },
        accessToken,
      );

      return handlerInput.responseBuilder
        .speak(`Marked ${itemName} as done.`)
        .getResponse();
    } catch (err) {
      console.error('[Alexa:CheckOffIntent] Error:', err.message);
      return handlerInput.responseBuilder
        .speak(`Sorry, I couldn't find ${itemName} on your list.`)
        .getResponse();
    }
  },
};

// ─── Built-in Handlers ───────────────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(
        'Welcome to GroceryApp. You can say add an item, read my list, or check off an item. What would you like to do?',
      )
      .reprompt('You can say add milk to my grocery list, or say read my list.')
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(
        'You can add items by saying something like "add milk to my grocery list", ' +
        '"add a dozen eggs", or "add 2 litres of milk". You can also say "what\'s on my list" ' +
        'to hear your items, or "mark eggs as done" to check something off.',
      )
      .reprompt('How can I help you with your grocery list?')
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
        Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent')
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Goodbye! Happy grocery shopping.')
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest'
    );
  },
  handle(handlerInput) {
    console.log(
      `Session ended: ${JSON.stringify(handlerInput.requestEnvelope.request.reason)}`,
    );
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error(`[Alexa] Error: ${error.message}`);
    return handlerInput.responseBuilder
      .speak('Sorry, I encountered an error. Please try again.')
      .getResponse();
  },
};

// ─── Lambda Exports ──────────────────────────────────────────────────────────

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AddItemIntentHandler,
    GetListIntentHandler,
    CheckOffIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandler(ErrorHandler)
  .lambda();