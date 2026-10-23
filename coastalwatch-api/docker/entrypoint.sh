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
    php artisan db:seed --class='Database\Seeders\StarterSitesSeeder' --force
fi

php artisan config:cache
exec apache2-foreground
