<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail_helpers.php';

const DEFAULT_SUBJECT = 'Poznaj wszystkie pozycje – nasze typy';

$data = requireJsonInput();

$partnerEmail = filter_var($data['partner_email'] ?? $data['email'] ?? '', FILTER_VALIDATE_EMAIL);
if ($partnerEmail === false) {
    respond([
        'ok' => false,
        'error' => 'Podaj poprawny adres e-mail partnera.',
    ]);
}

$shareUrl = trim((string)($data['share_url'] ?? $data['url'] ?? ''));
if ($shareUrl === '' || filter_var($shareUrl, FILTER_VALIDATE_URL) === false) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się przygotować linku do udostępnienia. Odśwież stronę i spróbuj ponownie.',
    ]);
}

$shareUrl = filter_var($shareUrl, FILTER_SANITIZE_URL) ?: $shareUrl;

$subject = sanitizeLine($data['subject'] ?? DEFAULT_SUBJECT);
if ($subject === '') {
    $subject = DEFAULT_SUBJECT;
}

$senderName = sanitizeLine($data['sender_name'] ?? '');
$rawMessage = sanitizeParagraph($data['message'] ?? $data['share_message'] ?? '');
$likeCount = (int)($data['like_count'] ?? 0);

if ($rawMessage === '') {
    if ($likeCount > 0) {
        $rawMessage = sprintf(
            'Wybrałem/Wybrałam %d %s. Zobacz i dołącz: %s',
            $likeCount,
            pluralizePositions($likeCount),
            $shareUrl
        );
    } else {
        $rawMessage = 'Zobacz i dołącz: ' . $shareUrl;
    }
}

$introLine = $senderName !== ''
    ? sprintf('%s przesyła Ci swoje typy w grze „Poznaj wszystkie pozycje”.', $senderName)
    : 'Twój partner przesyła Ci swoje typy w grze „Poznaj wszystkie pozycje”.';

$bodyLines = [
    'Cześć!',
    '',
    $introLine,
    '',
    $rawMessage,
    '',
    'Jeśli link się nie otwiera, skopiuj ten adres i wklej go w przeglądarkę:',
    $shareUrl,
    '',
    'Miłej zabawy!',
    'Momenty',
];

$body = implode("\n", $bodyLines);

if (!sendEmailMessage($partnerEmail, $subject, $body)) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się wysłać wiadomości. Spróbuj ponownie później.',
    ]);
}

respond(['ok' => true]);

function sanitizeLine(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    return preg_replace('/\s+/', ' ', $text) ?? '';
}

function sanitizeParagraph(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    $text = preg_replace('/\s+/', ' ', $text) ?? '';
    return $text;
}

function pluralizePositions(int $count): string
{
    $absolute = abs($count);
    if ($absolute === 1) {
        return 'pozycję';
    }
    if ($absolute % 10 >= 2 && $absolute % 10 <= 4 && ($absolute % 100 < 10 || $absolute % 100 >= 20)) {
        return 'pozycje';
    }
    return 'pozycji';
}
