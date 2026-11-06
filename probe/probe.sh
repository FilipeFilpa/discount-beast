#!/usr/bin/env bash
# Sonda temporária: baixa páginas candidatas e guarda o HTML para análise.
cd "$(dirname "$0")"; mkdir -p out
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
: > out/status.txt
while read -r name url; do
  [ -z "$name" ] && continue
  code=$(curl -sL -m 25 -A "$UA" -H 'accept-language: pt-BR,pt;q=0.9' -H 'accept: text/html' -o "out/$name.html" -w '%{http_code} %{size_download} %{url_effective}' "$url")
  echo "$name $code" | tee -a out/status.txt
done < urls.txt
