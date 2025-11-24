import { postJson } from './app.js';

document.addEventListener('DOMContentLoaded', async () => {
  const textarea = document.getElementById('questions-json');
  const form = document.getElementById('import-form');
  if (!textarea || !form) return;

  try {
    const response = await fetch('data/questions.json', { cache: 'no-store' });
    if (response.ok) {
      textarea.value = await response.text();
    }
  } catch (error) {
    console.warn('Nie udało się pobrać pytań', error);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const raw = textarea.value.trim();
    if (!raw) {
      alert('Wklej dane w formacie JSON.');
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item.id !== 'string' || typeof item.category !== 'string' || typeof item.text !== 'string')) {
        throw new Error('Sprawdź strukturę danych – wymagane pola id, category, text.');
      }
      const payload = await postJson('api/import_questions.php', parsed);
      if (!payload.ok) {
        throw new Error(payload.error || 'Import zakończony błędem.');
      }
      alert('Zapisano nowe pytania.');
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  });
});
