<?php

declare(strict_types=1);

define('BOOTSTRAP_EMIT_JSON', true);
require_once __DIR__ . '/bootstrap.php';

$relativePath = '../obrazy/zdrapki';
$directory = realpath(__DIR__ . DIRECTORY_SEPARATOR . $relativePath);

if ($directory === false || !is_dir($directory)) {
    echo json_encode([
        'ok' => false,
        'error' => 'Folder z kartami nie istnieje.',
        'files' => [],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$allowedExtensions = ['png', 'jpg', 'jpeg', 'webp'];
$files = [];

$iterator = scandir($directory);
if ($iterator === false) {
    echo json_encode([
        'ok' => false,
        'error' => 'Nie udało się odczytać zawartości folderu.',
        'files' => [],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

foreach ($iterator as $entry) {
    if ($entry === '.' || $entry === '..') {
        continue;
    }
    $path = $directory . DIRECTORY_SEPARATOR . $entry;
    if (!is_file($path)) {
        continue;
    }
    $extension = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
    if (!in_array($extension, $allowedExtensions, true)) {
        continue;
    }
    $files[] = 'obrazy/zdrapki/' . $entry;
}

natsort($files);
$files = array_values($files);

echo json_encode([
    'ok' => true,
    'files' => $files,
], JSON_UNESCAPED_UNICODE);
