<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    /**
     * The configurable settings schema. Each entry declares a type and a
     * default sourced from the live app config — so nothing is fabricated and
     * values are meaningful even before anything has been saved.
     */
    private function schema(): array
    {
        return [
            // General
            'app_name'         => ['type' => 'string',  'group' => 'general', 'default' => config('app.name', 'BAKAWATCH')],
            'organization_name'=> ['type' => 'string',  'group' => 'general', 'default' => 'MENRO Gloria, Oriental Mindoro'],
            'support_email'    => ['type' => 'string',  'group' => 'general', 'default' => config('mail.from.address', 'no-reply@bakawatch.local')],
            'timezone'         => ['type' => 'string',  'group' => 'general', 'default' => config('app.timezone', 'UTC')],

            // Security
            'session_lifetime_minutes' => ['type' => 'integer', 'group' => 'security', 'default' => (int) config('session.lifetime', 120)],
            'max_login_attempts'       => ['type' => 'integer', 'group' => 'security', 'default' => 5],
            'lockout_minutes'          => ['type' => 'integer', 'group' => 'security', 'default' => 15],

            // Notifications
            'email_notifications_enabled' => ['type' => 'boolean', 'group' => 'notifications', 'default' => config('mail.default') !== 'log'],
            'push_notifications_enabled'  => ['type' => 'boolean', 'group' => 'notifications', 'default' => false],

            // Backups
            'backup_retention_days' => ['type' => 'integer', 'group' => 'backups', 'default' => 30],
        ];
    }

    public function index(): JsonResponse
    {
        $schema = $this->schema();
        $stored = Setting::whereIn('key', array_keys($schema))->get()->keyBy('key');

        $settings = [];
        foreach ($schema as $key => $meta) {
            $settings[$key] = isset($stored[$key])
                ? $stored[$key]->typedValue()
                : $meta['default'];
        }

        // Group metadata so the UI can lay out sections.
        $groups = [];
        foreach ($schema as $key => $meta) {
            $groups[$meta['group']][] = $key;
        }

        return response()->json([
            'settings' => $settings,
            'groups'   => $groups,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $schema = $this->schema();

        $rules = [];
        foreach ($schema as $key => $meta) {
            $rules[$key] = match ($meta['type']) {
                'boolean' => 'sometimes|boolean',
                'integer' => 'sometimes|integer|min:0',
                default   => 'sometimes|string|max:255',
            };
        }
        // Tighter bounds for specific fields.
        $rules['support_email']             = 'sometimes|email|max:255';
        $rules['session_lifetime_minutes']  = 'sometimes|integer|min:5|max:43200';
        $rules['max_login_attempts']        = 'sometimes|integer|min:1|max:100';
        $rules['lockout_minutes']           = 'sometimes|integer|min:1|max:1440';
        $rules['backup_retention_days']     = 'sometimes|integer|min:1|max:365';

        $validated = $request->validate($rules);

        $changed = [];
        foreach ($validated as $key => $value) {
            if (!isset($schema[$key])) continue;
            $type = $schema[$key]['type'];
            $stringValue = match ($type) {
                'boolean' => $value ? '1' : '0',
                'integer' => (string) (int) $value,
                default   => (string) $value,
            };
            Setting::updateOrCreate(['key' => $key], ['value' => $stringValue, 'type' => $type]);
            $changed[] = $key;
        }

        if ($changed) {
            ActivityLog::record('settings.updated', null, [], ['keys' => $changed]);
        }

        return $this->index();
    }
}
