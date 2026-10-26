<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'ml' => [
        'url' => env('ML_SERVICE_URL', 'http://127.0.0.1:8001'),
        // Model version stamped onto AI classifications for traceability.
        // Matches the ml-service FastAPI app version (MobileNetV2 + iNaturalist).
        'model_version' => env('ML_MODEL_VERSION', 'mobilenetv2-inat-v2.0.0'),
    ],

    'fcm' => [
        'server_key' => env('FCM_SERVER_KEY', ''),
    ],

    'weather' => [
        'latitude' => (float) env('WEATHER_LATITUDE', 12.983294),
        'longitude' => (float) env('WEATHER_LONGITUDE', 121.4666648),
    ],

    // Firebase Authentication — the project id is used to validate the
    // audience/issuer of incoming Firebase ID tokens. The service-account
    // credentials file (FIREBASE_CREDENTIALS) is only needed for privileged
    // Admin operations; plain ID-token verification uses Google's public certs.
    'firebase' => [
        'project_id'  => env('FIREBASE_PROJECT_ID', ''),
        'credentials' => env('FIREBASE_CREDENTIALS', ''),
    ],

];
