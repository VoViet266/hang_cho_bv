/**
 * SignalR to Socket.IO compatibility adapter for HangChoKhamBenh
 * Giúp client script (displayBoard.js, multiBoard.js) hoạt động hoàn hảo với SignalR Hub
 */
(function (window) {
    function SignalRAdapter(options) {
        const listeners = {};
        let isConnected = false;

        const connection = new signalR.HubConnectionBuilder()
            .withUrl("/queueHub")
            .withAutomaticReconnect([0, 1000, 2000, 3000, 5000])
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
            trigger("room_data_updated", payload);
        });

        connection.on("trigger_speak", (payload) => {
            trigger("trigger_speak", payload);
        });

        connection.onreconnecting(() => {
            isConnected = false;
            trigger("disconnect");
        });

        connection.onreconnected(() => {
            isConnected = true;
            trigger("connect");
        });

        connection.onclose(() => {
            isConnected = false;
            trigger("disconnect");
        });

        async function start() {
            try {
                await connection.start();
                isConnected = true;
                trigger("connect");
            } catch (err) {
                console.warn("[SignalR Adapter] Kết nối thất bại, tự động thử lại sau 2 giây...", err);
                trigger("connect_error", err);
                setTimeout(start, 2000);
            }
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
                if (connection.state !== signalR.HubConnectionState.Connected) {
                    const retry = () => {
                        if (connection.state === signalR.HubConnectionState.Connected) {
                            self.emit(event, data);
                        } else {
                            setTimeout(retry, 200);
                        }
                    };
                    setTimeout(retry, 200);
                    return;
                }

                if (event === "join_room") {
                    connection.invoke("JoinRoom", data.roomType || "", data.roomId || "").catch((e) => console.error(e));
                } else if (event === "leave_room") {
                    connection.invoke("LeaveRoom", data.roomType || "", data.roomId || "").catch((e) => console.error(e));
                } else if (event === "broadcast_speak") {
                    connection.invoke("BroadcastSpeak", data.roomType || "room", data.roomId || "", data.patientName || "", data.roomName || "").catch((e) => console.error(e));
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
})(window);
