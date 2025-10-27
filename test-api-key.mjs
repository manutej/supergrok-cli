import OpenAI from 'openai';

const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
if (!apiKey) {
  console.error('❌ Error: API key not found. Set XAI_API_KEY or GROK_API_KEY environment variable.');
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.x.ai/v1',
  timeout: 30000,
});

async function testAPI() {
  try {
    console.log('Testing API key with a simple chat completion...\n');

    const response = await client.chat.completions.create({
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Say "API works!" if you can read this.' }],
      max_tokens: 20,
    });

    console.log('✅ SUCCESS! API key is working!');
    console.log('\nResponse:');
    console.log(response.choices[0].message.content);
    console.log('\nAPI Key Status: VALID ✓');

  } catch (error) {
    console.log('❌ FAILED! API key test failed.');
    console.log('\nError details:');
    console.log('Name:', error.name);
    console.log('Message:', error.message);
    if (error.status) console.log('Status:', error.status);
    if (error.code) console.log('Code:', error.code);
    if (error.response?.data) console.log('Response:', JSON.stringify(error.response.data, null, 2));
    console.log('\nAPI Key Status: INVALID or ACCESS DENIED ✗');
  }
}

testAPI();
