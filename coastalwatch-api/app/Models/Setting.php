<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['key', 'value', 'type'];

    /** Cast a stored string value to its declared type. */
    public function typedValue(): mixed
    {
        return match ($this->type) {
            'boolean' => filter_var($this->value, FILTER_VALIDATE_BOOLEAN),
            'integer' => (int) $this->value,
            default   => $this->value,
        };
    }

    /** Read a single setting value (typed), falling back to $default. */
    public static function get(string $key, mixed $default = null): mixed
    {
        $row = static::where('key', $key)->first();
        return $row ? $row->typedValue() : $default;
    }
}
