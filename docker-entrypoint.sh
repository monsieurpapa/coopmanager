#!/bin/sh
# Railway injects $PORT at runtime. Substitute it into the nginx config.
sed -i "s/PORT_PLACEHOLDER/${PORT:-8080}/g" /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
