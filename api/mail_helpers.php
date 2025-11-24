<?php

declare(strict_types=1);

function sendEmailMessage(string $to, string $subject, string $body, ?string $replyTo = null): bool
{
    $headers = [
        'Content-Type: text/plain; charset=utf-8',
        'From: Momenty <no-reply@allemedia.pl>',
    ];

    if ($replyTo) {
        $replyTo = filter_var($replyTo, FILTER_VALIDATE_EMAIL) ?: null;
        if ($replyTo) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }
    }

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $sent = false;
    if (function_exists('mail')) {
        $sent = @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
    }

    if ($sent) {
        return true;
    }

    $logDir = __DIR__ . '/../db';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }

    $logEntry = sprintf("[%s]\nTo: %s\nSubject: %s\nHeaders: %s\n%s\n\n", date('c'), $to, $subject, implode('; ', $headers), $body);
    return @file_put_contents($logDir . '/email.log', $logEntry, FILE_APPEND) !== false;
}
