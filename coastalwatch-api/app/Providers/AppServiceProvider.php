<?php

namespace App\Providers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        // Serialize all Eloquent dates as ISO 8601 so JS new Date() parses them correctly
        Model::$snakeAttributes = true;
        \Illuminate\Database\Eloquent\Model::setConnectionResolver(app('db'));

        // Use ISO 8601 date format for all JSON responses
        \Carbon\Carbon::serializeUsing(fn ($carbon) => $carbon->toIso8601String());
    }
}
