export const getGroqConfig = () => ({
  apiKey: process.env.GROQ_API_KEY ?? '',
  model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
});
