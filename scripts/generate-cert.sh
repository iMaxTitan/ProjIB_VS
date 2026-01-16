#!/bin/bash

# Создаем директорию для сертификатов
mkdir -p certs

# Генерируем приватный ключ
openssl genrsa -out certs/key.pem 2048

# Генерируем CSR (Certificate Signing Request)
openssl req -new -key certs/key.pem -out certs/csr.pem -subj "/CN=maxtitan.me"

# Генерируем самоподписанный сертификат
openssl x509 -req -days 365 -in certs/csr.pem -signkey certs/key.pem -out certs/cert.pem

echo "Сертификаты созданы в директории certs/" 