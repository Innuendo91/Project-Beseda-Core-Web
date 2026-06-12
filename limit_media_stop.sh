#!/bin/bash

TC="/sbin/tc"
IPTABLES="/sbin/iptables"
INTERFACE="enp6s0"

$TC qdisc del dev $INTERFACE ingress 2>/dev/null
$IPTABLES -t mangle -F 2>/dev/null

echo "Ограничение отключено"
