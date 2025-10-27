import OpenAI from 'openai';

const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
if (!apiKey) {
  console.error('❌ Error: API key not found. Set XAI_API_KEY or GROK_API_KEY environment variable.');
  process.exit(1);
}

const modelsToTest = [
  'grok-beta',
  'grok-2-latest',
  'grok-2',
  'grok-vision-beta',
];

async function testModel(modelName) {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
    timeout: 30000,
  });

  try {
    console.log(`\n🔍 Testing model: ${modelName}`);

    const response = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: 'Respond with just: API works!' }],
      max_tokens: 10,
    });

    console.log(`✅ SUCCESS with ${modelName}!`);
    console.log(`Response: ${response.choices[0].message.content}`);
    return true;

  } catch (error) {
    console.log(`❌ Failed with ${modelName}`);
    console.log(`Error: ${error.message}`);

    // Try to extract more details
    if (error.error) {
      console.log(`API Error:`, JSON.stringify(error.error, null, 2));
    }
    if (error.cause) {
      console.log(`Cause:`, error.cause.message || error.cause);
    }
    return false;
  }
}

async function testListModels() {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
    timeout: 30000,
  });

  try {
    console.log('\n🔍 Testing /v1/models endpoint...');
    const models = await client.models.list();
    console.log('✅ Models endpoint works!');
    console.log('Available models:');
    for (const model of models.data) {
      console.log(`  - ${model.id}`);
    }
    return true;
  } catch (error) {
    console.log('❌ Models endpoint failed');
    console.log(`Error: ${error.message}`);
    if (error.status) console.log(`Status: ${error.status}`);
    return false;
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════');
  console.log('  X.AI API Key Validation Test');
  console.log('═══════════════════════════════════════');

  // First try to list models
  const modelsWork = await testListModels();

  if (modelsWork) {
    console.log('\n✅ API Key is VALID and has access!');
  } else {
    console.log('\n⚠️  Trying individual models...');
    // Try each model
    for (const model of modelsToTest) {
      const success = await testModel(model);
      if (success) {
        console.log('\n✅ API Key is VALID!');
        process.exit(0);
      }
    }
    console.log('\n❌ API Key appears to be INVALID or ACCESS is DENIED');
  }
}

runAllTests();
