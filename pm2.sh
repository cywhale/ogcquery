#!/bin/bash
echo "#---------------------OGCquery API Start at $(date '+%Y%m%d %H:%M:%S')"
pm2 -n ogcquery start -i 1 npm -- run prod

