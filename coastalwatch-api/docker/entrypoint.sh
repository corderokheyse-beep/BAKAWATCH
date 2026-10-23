#!/bin/sh
set -eu

# Render's default web-service port is 10000. Keep Apache on the configured port.
render_port="${PORT:-10000}"
sed -i "s/^Listen 80$/Listen ${render_port}/" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:10000>/<VirtualHost *:${render_port}>/" /etc/apache2/sites-available/000-default.conf

cd /var/www/html

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    php artisan migrate --force
fi

if [ "${RUN_STARTER_SITES_SEEDER:-false}" = "true" ]; then
    if [ -z "${ADMIN_PASSWORD:-}" ]; then
        echo "RUN_STARTER_SITES_SEEDER requires ADMIN_PASSWORD to create or activate the site creator account."
        exit 1
    fi
    php artisan db:seed --class='Database\Seeders\ProductionSeeder' --force
    php artisan db:seed --class='Database\Seeders\StarterSitesSeeder' --force
fi

php artisan config:cache
exec apache2-foreground
