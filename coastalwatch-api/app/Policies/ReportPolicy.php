<?php

namespace App\Policies;

use App\Models\Report;
use App\Models\User;

class ReportPolicy
{
    public function update(User $user, Report $report): bool
    {
        return $user->id === $report->user_id && $report->status === 'pending';
    }

    public function delete(User $user, Report $report): bool
    {
        return $user->id === $report->user_id || $user->isStaff() || $user->role === 'menro';
    }

    public function review(User $user): bool
    {
        return $user->isStaff();
    }
}
