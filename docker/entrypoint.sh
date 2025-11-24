#!/bin/sh
#
# This script is executed when the Docker container starts.
# It generates a config.js file from a template, substituting
# environment variables for Supabase credentials.

# Define the path for the output config file
OUTPUT_FILE="/usr/share/nginx/html/config.js"
TEMPLATE_FILE="/usr/share/nginx/html/config.template.js"

# Substitute environment variables in the template file
# and create the final config.js
envsubst '${VITE_SUPABASE_URL},${VITE_SUPABASE_KEY}' < ${TEMPLATE_FILE} > ${OUTPUT_FILE}

echo "Generated ${OUTPUT_FILE} with Supabase configuration."

# Start Nginx in the foreground
exec nginx -g 'daemon off;'
