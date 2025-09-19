export const getGroqConfig = () => ({
  apiKey: process.env.GROQ_API_KEY ?? '',
  model: process.env.GROQ_MODEL ?? 'moonshotai/kimi-k2-instruct-0905',
});
