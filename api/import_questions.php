<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

if (!is_array($data) || !array_is_list($data)) {
    respond(['ok' => false, 'error' => 'Oczekiwano listy pytań.']);
}

foreach ($data as $item) {
    if (!is_array($item)) {
        respond(['ok' => false, 'error' => 'Niepoprawny format pytania.']);
    }
    if (!isset($item['id'], $item['category'], $item['text']) || !is_string($item['id']) || !is_string($item['category']) || !is_string($item['text'])) {
        respond(['ok' => false, 'error' => 'Pytanie musi mieć pola id, category, text.']);
    }
}

$payload = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($payload === false) {
    respond(['ok' => false, 'error' => 'Nie udało się zakodować JSON.']);
}

$file = __DIR__ . '/../data/questions.json';
if (file_put_contents($file, $payload . "\n") === false) {
    respond(['ok' => false, 'error' => 'Nie udało się zapisać pliku.']);
}

respond(['ok' => true]);
