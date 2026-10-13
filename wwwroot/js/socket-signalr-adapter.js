/**
 * SignalR to Socket.IO compatibility adapter for HangChoKhamBenh
 * Adapter cho displayBoard.js dùng SignalR Hub.
 * Tích hợp cơ chế tự động kết nối vô hạn (Infinite Reconnect), khôi phục phòng và Fallback Reload khi mạng lag/đứt kết nối
 */
(function (window) {
    // ═══════════════ CƠ CHẾ AN TOÀN NẠP LẠI TRANG (FALLBACK RELOAD) ═══════════════
    function safeFallbackReload(reason) {
        try {
            const now = Date.now();
            const lastReload = parseInt(sessionStorage.getItem("last_fallback_reload_ts") || "0", 10);
            if (now - lastReload < 60000) {
                console.warn("[Network Watchdog] Đã nạp lại cách đây chưa đầy 60 giây, tạm hoãn để chống reload loop.");
                return;
            }
            sessionStorage.setItem("last_fallback_reload_ts", String(now));
            console.warn(`[Network Watchdog] Kích hoạt Fallback Reload (Lý do: ${reason}). Đang tải lại trang...`);
            setTimeout(() => {
                window.location.reload();
            }, 800);
        } catch (e) {
            window.location.reload();
        }
    }

    // Tự động làm mới bộ nhớ vào lúc 04:30 sáng hàng ngày nếu màn hình TV chạy xuyên đêm (>6 giờ)
    const pageLoadedAt = Date.now();
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 4 && now.getMinutes() === 30 && (Date.now() - pageLoadedAt > 6 * 3600 * 1000)) {
            safeFallbackReload("Làm mới bộ nhớ định kỳ 04:30 sáng cho TV Kiosk");
        }
    }, 60000);

    function SignalRAdapter(options) {
        const listeners = {};
        const activeRooms = new Map(); // Lưu danh sách phòng đã đăng ký để tự động Join lại khi kết nối lại
        let isConnected = false;
        let disconnectStartTime = null;
        let isReconnectingManual = false;

        const connection = new signalR.HubConnectionBuilder()
            .withUrl("/queueHub")
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds: (retryContext) => {
                    // Tự động thử lại vô hạn: 0s -> 1s -> 2s -> 3s -> 5s -> lặp lại 5s mãi mãi
                    const delays = [0, 1000, 2000, 3000, 5000];
                    return delays[retryContext.previousAttempts] || 5000;
                }
            })
            .build();

        function trigger(event, ...args) {
            const callbacks = listeners[event] || [];
            callbacks.forEach((cb) => {
                try {
                    cb(...args);
                } catch (e) {
                    console.error("[SignalR Adapter] Lỗi khi thực thi event callback: " + event, e);
                }
            });
        }

        connection.on("room_data_updated", (payload) => {
            disconnectStartTime = null;
            trigger("room_data_updated", payload);
        });

        connection.on("trigger_speak", (payload) => {
            disconnectStartTime = null;
            trigger("trigger_speak", payload);
        });

        connection.onreconnecting(() => {
            isConnected = false;
            if (!disconnectStartTime) disconnectStartTime = Date.now();
            trigger("disconnect");
        });

        connection.onreconnected(() => {
            const wasDisconnectedLong = disconnectStartTime && (Date.now() - disconnectStartTime > 60000);
            isConnected = true;
            disconnectStartTime = null;
            isReconnectingManual = false;

            console.log("[SignalR Adapter] Đã kết nối lại thành công Hub. Đang tự động đăng ký lại các phòng...");
            resubscribeAllRooms();
            trigger("connect");

            // Nếu bị mất mạng quá lâu (>60s) trước khi kết nối lại, chủ động kích hoạt reload an toàn để đồng bộ sạch
            if (wasDisconnectedLong) {
                safeFallbackReload("Mạng gián đoạn hơn 60 giây và vừa phục hồi");
            }
        });

        connection.onclose(() => {
            isConnected = false;
            if (!disconnectStartTime) disconnectStartTime = Date.now();
            trigger("disconnect");
            console.warn("[SignalR Adapter] Kết nối Hub bị đóng. Bắt đầu vòng lặp thử lại vô hạn...");
            scheduleReconnect();
        });

        function resubscribeAllRooms() {
            if (connection.state !== signalR.HubConnectionState.Connected) return;
            activeRooms.forEach((data, key) => {
                connection.invoke("JoinRoom", data.roomType || "", data.roomId || "").catch((err) => {
                    console.warn(`[SignalR Adapter] Lỗi khi join lại phòng ${key}:`, err);
                });
            });
        }

        async function start() {
            if (isReconnectingManual || connection.state === signalR.HubConnectionState.Connected) return;
            isReconnectingManual = true;

            try {
                await connection.start();
                isConnected = true;
                disconnectStartTime = null;
                isReconnectingManual = false;
                console.log("[SignalR Adapter] Kết nối thành công SignalR Hub.");
                resubscribeAllRooms();
                trigger("connect");
            } catch (err) {
                isReconnectingManual = false;
                if (!disconnectStartTime) disconnectStartTime = Date.now();
                console.warn("[SignalR Adapter] Kết nối thất bại, tự động thử lại sau 3 giây...", err);
                trigger("connect_error", err);
                scheduleReconnect();
            }
        }

        function scheduleReconnect() {
            if (isReconnectingManual || connection.state === signalR.HubConnectionState.Connected) return;
            setTimeout(() => {
                if (connection.state === signalR.HubConnectionState.Disconnected) {
                    start();
                }
            }, 3000);
        }

        // Bắt sự kiện mạng hệ thống phục hồi (Online)
        if (typeof window !== "undefined") {
            window.addEventListener("online", () => {
                console.log("[SignalR Adapter] Phát hiện thiết bị có mạng trở lại (Online). Đang kích hoạt kết nối lại...");
                if (connection.state === signalR.HubConnectionState.Disconnected) {
                    start();
                }
            });

            window.addEventListener("offline", () => {
                console.warn("[SignalR Adapter] Thiết bị mất kết nối mạng (Offline).");
                isConnected = false;
                if (!disconnectStartTime) disconnectStartTime = Date.now();
                trigger("disconnect");
            });
        }

        start();

        return {
            connection,
            on: function (event, callback) {
                if (!listeners[event]) listeners[event] = [];
                listeners[event].push(callback);
                if (event === "connect" && isConnected) {
                    setTimeout(callback, 10);
                }
            },
            emit: function (event, data) {
                const self = this;
                if (event === "join_room" && data && data.roomId) {
                    const roomKey = `${data.roomType || "room"}_${data.roomId}`;
                    activeRooms.set(roomKey, data);
                } else if (event === "leave_room" && data && data.roomId) {
                    const roomKey = `${data.roomType || "room"}_${data.roomId}`;
                    activeRooms.delete(roomKey);
                }

                if (connection.state !== signalR.HubConnectionState.Connected) {
                    const retry = () => {
                        if (connection.state === signalR.HubConnectionState.Connected) {
                            self.emit(event, data);
                        } else {
                            setTimeout(retry, 300);
                        }
                    };
                    setTimeout(retry, 300);
                    return;
                }

                if (event === "join_room") {
                    connection.invoke("JoinRoom", data.roomType || "", data.roomId || "").catch((e) => console.error(e));
                } else if (event === "leave_room") {
                    connection.invoke("LeaveRoom", data.roomType || "", data.roomId || "").catch((e) => console.error(e));
                } else if (event === "broadcast_speak") {
                    connection.invoke("BroadcastSpeak", data.roomType || "room", data.roomId || "", data.patientName || "", data.roomName || "", data.dobYear || "").catch((e) => console.error(e));
                }
            },
            disconnect: function () {
                connection.stop();
            }
        };
    }

    window.io = function (opts) {
        return SignalRAdapter(opts);
    };
    window.safeFallbackReload = safeFallbackReload;
})(window);
