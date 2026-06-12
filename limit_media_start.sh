#!/bin/bash

# Пути к командам
TC="/sbin/tc"
IPTABLES="/sbin/iptables"

# Параметры
INTERFACE="enp6s0"
PORT="8890"
LIMIT="20mbit"
BURST="5m"  # Изменено с 1m на 10k

# Очистка
$TC qdisc del dev $INTERFACE ingress 2>/dev/null
$IPTABLES -t mangle -F 2>/dev/null

# Создание ingress очереди
$TC qdisc add dev $INTERFACE ingress

# Маркировка трафика
$IPTABLES -t mangle -A PREROUTING -p tcp --dport $PORT -j MARK --set-mark 1

# Применение ограничения (правильный синтаксис police)
$TC filter add dev $INTERFACE parent ffff: protocol ip prio 1 u32 \
    match ip dport $PORT 0xffff \
    police rate $LIMIT burst $BURST drop

echo "Ограничение включено: $LIMIT на порт $PORT для каждого IP"
