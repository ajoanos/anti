<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail_helpers.php';

const DEFAULT_PLAN_BASE = 'https://sklep.allemedia.pl/momenty/';

$data = requireJsonInput();

$partnerEmail = filter_var($data['partner_email'] ?? $data['email'] ?? '', FILTER_VALIDATE_EMAIL);
if ($partnerEmail === false) {
    respond([
        'ok' => false,
        'error' => 'Podaj poprawny adres e-mail partnera.',
    ]);
}

$senderEmail = filter_var($data['sender_email'] ?? '', FILTER_VALIDATE_EMAIL);
if ($senderEmail === false) {
    respond([
        'ok' => false,
        'error' => 'Podaj poprawny adres e-mail, na który mamy wysyłać odpowiedzi partnera.',
    ]);
}

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
if ($roomKey === '' || $participantId <= 0) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się zidentyfikować pokoju.',
    ]);
}

$room = getRoomByKey($roomKey);
if ($room === null) {
    respond([
        'ok' => false,
        'error' => 'Pokój wygasł lub nie istnieje. Wróć do ekranu startowego.',
    ]);
}

$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant || ($participant['status'] ?? '') !== 'active') {
    respond([
        'ok' => false,
        'error' => 'Twoje połączenie z pokojem wygasło. Spróbuj ponownie.',
    ]);
}

$senderName = sanitizeLine($data['sender_name'] ?? '');
$participantDisplayName = trim((string)($participant['display_name'] ?? ''));
if ($senderName === '' && $participantDisplayName !== '') {
    $senderName = $participantDisplayName;
}
$mood = sanitizeLine($data['mood'] ?? '');
$closeness = sanitizeLine($data['closeness'] ?? '');
$energy = sanitizeLine($data['energy'] ?? '');
$energyContext = sanitizeParagraph($data['energyContext'] ?? '');
$startTime = sanitizeLine($data['timing'] ?? '');
$subject = sanitizeLine($data['subject'] ?? 'Wieczór we dwoje – krótki plan 💛');
if ($subject === '') {
    $subject = 'Wieczór we dwoje – krótki plan 💛';
}

$extras = $data['extras'] ?? [];
if (!is_array($extras)) {
    $extras = [];
}
$extras = array_values(array_filter(array_map('sanitizeLine', $extras), static fn (string $value): bool => $value !== ''));
$extrasText = $extras ? implode(', ', $extras) : 'Brak dodatków';
$extrasJson = json_encode($extras, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (!is_string($extrasJson)) {
    $extrasJson = '[]';
}

$originUrl = trim((string)($data['origin'] ?? ''));
if ($originUrl !== '' && filter_var($originUrl, FILTER_VALIDATE_URL) === false) {
    $originUrl = '';
}
$baseUrl = trim((string)($data['base_url'] ?? ''));
if ($baseUrl !== '' && filter_var($baseUrl, FILTER_VALIDATE_URL) === false) {
    $baseUrl = '';
}
if ($baseUrl !== '' && substr($baseUrl, -1) !== '/') {
    $baseUrl .= '/';
}

$link = trim((string)($data['link'] ?? ''));
if ($link !== '' && filter_var($link, FILTER_VALIDATE_URL) === false) {
    $link = '';
}

$proposalLink = trim((string)($data['proposal_link'] ?? ''));
if ($proposalLink !== '' && filter_var($proposalLink, FILTER_VALIDATE_URL) === false) {
    $proposalLink = '';
}

$roomId = (int)$room['id'];
$roomKeyValue = (string)($room['room_key'] ?? $roomKey);

$planBase = '';
if ($link !== '') {
    $planBase = preg_replace('/\?.*/', '', $link) ?: '';
    if (!filter_var($planBase, FILTER_VALIDATE_URL)) {
        $planBase = '';
    }
}
if ($planBase === '') {
    if ($baseUrl !== '') {
        $planBase = $baseUrl . 'plan-wieczoru-play.html';
    } elseif ($originUrl !== '') {
        $planBase = rtrim($originUrl, '/') . '/pary-mvp/plan-wieczoru-play.html';
    } else {
        $planBase = DEFAULT_PLAN_BASE . 'plan-wieczoru-play.html';
    }
}

$hostDisplayName = limitLength($participantDisplayName !== '' ? $participantDisplayName : $senderName, 40);
$hostParams = [
    'room_key' => $roomKeyValue,
    'pid' => (string)(int)$participant['id'],
    'auto' => '1',
    'via' => 'host',
];
if ($hostDisplayName !== '') {
    $hostParams['name'] = $hostDisplayName;
}

$partnerName = sanitizeLine($data['partner_name'] ?? '');
if ($partnerName === '') {
    $emailLocal = strstr($partnerEmail, '@', true);
    if ($emailLocal !== false && $emailLocal !== '') {
        $emailLocal = preg_replace('/[^\p{L}0-9]+/u', ' ', $emailLocal) ?? $emailLocal;
        $partnerName = sanitizeLine($emailLocal);
    }
}
$partnerName = limitLength($partnerName, 40);
if ($partnerName === '') {
    $partnerName = 'Partner';
}

$partnerParticipant = ensureParticipant($roomId, $partnerName, false, true);
if ((int)($partnerParticipant['id'] ?? 0) === (int)$participant['id']) {
    $basePartner = $partnerName !== '' ? $partnerName : 'Partner';
    $suffix = 2;
    do {
        $candidate = limitLength($basePartner . ' ' . $suffix, 40);
        $partnerParticipant = ensureParticipant($roomId, $candidate, false, true);
        if ((int)$partnerParticipant['id'] !== (int)$participant['id']) {
            $partnerName = $candidate;
            break;
        }
        $suffix++;
    } while ($suffix < 10);
}

$partnerParticipantId = (int)($partnerParticipant['id'] ?? 0);
if ($partnerParticipantId <= 0) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się przygotować zaproszenia. Odśwież stronę i spróbuj ponownie.',
    ]);
}

$partnerDisplayName = sanitizeLine($partnerParticipant['display_name'] ?? '') ?: $partnerName;
$partnerDisplayName = limitLength($partnerDisplayName, 40);

$link = buildPlanUrl($planBase, [
    'room_key' => $roomKeyValue,
    'pid' => (string)$partnerParticipantId,
    'name' => $partnerDisplayName,
    'auto' => '1',
    'via' => 'invite',
]);

$proposalLink = buildPlanUrl($planBase, $hostParams);

$token = generateUniqueToken();

$acceptBase = $baseUrl !== '' ? $baseUrl : ($originUrl !== '' ? rtrim($originUrl, '/') . '/pary-mvp/' : DEFAULT_PLAN_BASE);
$acceptUrl = $acceptBase . 'plan-wieczoru-accept.php?token=' . urlencode($token);
$declineUrl = $acceptUrl . '&decision=decline';

createPlanInvite(
    (int)$room['id'],
    (int)$participant['id'],
    $token,
    $senderEmail,
    $partnerEmail,
    $senderName,
    $mood,
    $closeness,
    $extrasJson,
    $energy,
    $energyContext,
    $startTime,
    $link,
    $proposalLink
);

$bodyLines = [
    'Twoja druga połówka zaprasza Cię dziś na wieczór pełen bliskości.',
    'Wybrała:',
    'Na jaki wieczór masz dziś ochotę?: ' . ($mood !== '' ? $mood : '—'),
    'Jakiej bliskości dziś potrzebujesz?: ' . ($closeness !== '' ? $closeness : '—'),
    'Co stworzy idealny klimat?: ' . $extrasText,
    'Jak tam dziś Twoja forma?: ' . ($energy !== '' ? $energy : '—'),
    'Kiedy chcesz żebyśmy zaczęli?: ' . ($startTime !== '' ? $startTime : '—'),
];

if ($energyContext !== '') {
    $bodyLines[] = '';
    $bodyLines[] = $energyContext;
}

$bodyLines[] = '';
$bodyLines[] = 'Zgadzam się: ' . $acceptUrl;
$bodyLines[] = 'Nie zgadzam się: ' . $declineUrl;
$bodyLines[] = '';
$bodyLines[] = 'Zaproponuj własny plan:';
$bodyLines[] = $link;

$body = implode("\n", $bodyLines);

if (!sendEmailMessage($partnerEmail, $subject, $body, $senderEmail)) {
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

function generateUniqueToken(): string
{
    do {
        $token = bin2hex(random_bytes(16));
    } while (getPlanInviteByToken($token) !== null);

    return $token;
}

function limitLength(string $text, int $maxLength): string
{
    if ($maxLength <= 0) {
        return '';
    }

    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($text) <= $maxLength) {
            return $text;
        }

        return mb_substr($text, 0, $maxLength);
    }

    if (strlen($text) <= $maxLength) {
        return $text;
    }

    return substr($text, 0, $maxLength);
}

function buildPlanUrl(string $base, array $params): string
{
    $filtered = [];
    foreach ($params as $key => $value) {
        if ($value === null) {
            continue;
        }

        $stringValue = (string)$value;
        if ($stringValue === '') {
            continue;
        }

        $filtered[$key] = $stringValue;
    }

    if ($filtered === []) {
        return $base;
    }

    $query = http_build_query($filtered, '', '&', PHP_QUERY_RFC3986);

    return $query !== '' ? $base . '?' . $query : $base;
}
