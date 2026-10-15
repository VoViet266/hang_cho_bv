# Phân bổ dữ liệu hàng chờ dược

Thời gian trở về cơ chế ban đầu: ứng dụng dùng múi giờ môi trường chạy, database dùng múi giờ phiên kết nối,
đồng hồ trình duyệt dùng múi giờ thiết bị. Code không ép UTC+7.
`ngaytao` giữ kiểu `timestamp` theo bảng hiện có và lưu giờ địa phương lúc gọi tên.

| Cột | Vai trò |
| --- | --- |
| `macho` | Khóa chính tự tăng của từng dòng hàng chờ. |
| `mabn` | Mã bệnh nhân. |
| `makb` | Mã lượt khám. Dùng gom các dòng BHYT/dịch vụ cùng lượt, không gom các lượt khám khác nhau. |
| `khochan` | `13`: dịch vụ; `14`: BHYT. Toa có cả hai được lưu hai dòng; `0` chỉ là mã gộp trên DTO giao diện. |
| `ngaykcb` | Thời điểm khám từ nguồn lượt khám. |
| `maba` | Mã bệnh án nếu nguồn có cung cấp. |
| `ngaynhap` | Thời điểm quét tiếp nhận lần đầu; không ghi đè khi gọi, ẩn hoặc hoàn tác. |
| `ngaytao` | Theo yêu cầu hiện tại: thời điểm gọi tên/gọi lại gần nhất. Chưa gọi thì `NULL`. |
| `taikhoan` | Code hiện dùng chứa ô đã gọi: `5` thu tiền, `3` nhận thuốc, `NULL` chưa gọi. Không phải tên nhân viên. |
| `dathu` | Dịch vụ đồng bộ từ chứng từ. BHYT đặt `true` để bỏ qua bước thu dịch vụ. |
| `ngaythu` | Lần đầu ứng dụng phát hiện dịch vụ đã thu. Giữ nguyên khi quét/gọi lại; nếu chứng từ trở lại chưa thu thì xóa mốc. BHYT thuần `NULL`. |
| `dagiao` | `0`: chờ phát; `1`: đã phát; `3`: không mua. |
| `ngaygiao` | Thời điểm thực phát thuốc. Chờ phát hoặc không mua thì `NULL`. |
| `ngayhoanthanh` | Thời điểm kết thúc xử lý: đã phát hoặc không mua. |
| `an` | `0`: hiện; `1`: ẩn. Không sửa giờ nhập/gọi/thu/giao/hoàn thành. |
| `xoa` | `0`: còn hiệu lực; `1`: xóa mềm. |

## Các bước xử lý

| Thao tác | Các cột được ghi |
| --- | --- |
| Quét tiếp nhận | `ngaynhap = hiện tại`; `dagiao = 0`; ô gọi, giờ gọi, giờ giao và giờ hoàn thành trống. Dịch vụ đã thu trước đó ghi giờ phát hiện vào `ngaythu`. |
| Gọi thu tiền | Dòng dịch vụ: `taikhoan = '5'`, `ngaytao = giờ gọi`; vẫn `dagiao = 0`. |
| Phát hiện dịch vụ đã thu | `dathu = true`, `ngaythu` chỉ ghi nếu còn trống; không đổi thứ tự gọi. |
| Gọi nhận thuốc | Các dòng cùng lượt: `taikhoan = '3'`, `ngaytao = giờ gọi`; vẫn `dagiao = 0`. |
| Gọi lại | Cập nhật `ngaytao`, giữ nguyên ô và trạng thái; phát sự kiện cập nhật màn hình. |
| Xác nhận đã phát | `dagiao = 1`, `ngaygiao` và `ngayhoanthanh` là giờ xác nhận. |
| Không mua | Dòng dịch vụ: `dagiao = 3`, `ngayhoanthanh = hiện tại`, `ngaygiao = NULL`. BHYT cùng lượt vẫn chờ. |
| Hoàn tác | Trở về `dagiao = 0`, `an = 0`; xóa ô gọi, giờ gọi, giờ giao và giờ hoàn thành; giữ giờ nhập và trạng thái/giờ thu. Quét tiếp theo sẽ gọi trước khi phát. |
| Ẩn/bỏ ẩn | Chỉ đổi `an`. |

## Thứ tự màn hình

Toa đã gọi đứng trước toa chưa gọi. Trong các toa đã gọi, giờ gọi tăng dần: ai quét gọi trước hiện trước.
Gọi lại cập nhật giờ gọi mới và xếp sau các toa được gọi sớm hơn.
Các dòng cùng `makb` lấy giờ gọi mới nhất của dòng đã có ô gọi; dòng mới tiếp nhận chưa được gọi không đẩy một toa lên trước người vừa được gọi.
Các toa chưa gọi xếp theo giờ tiếp nhận sớm trước. Khi trùng giờ gọi, dùng giờ tiếp nhận, `macho` rồi mã lượt khám để giữ thứ tự ổn định.
Ẩn, thu tiền hoặc cập nhật thông tin không thay đổi giờ gọi.

## Áp dụng

File `hangchoduoc_tmd.sql` mô tả đủ bảng, bỏ `DEFAULT now()` của `ngaytao` và thêm chú thích cột.
Script giữ dữ liệu và index hiện có; không tự đổi các mốc lịch sử đã ghi theo ý nghĩa cũ.
Code tiếp nhận cũng chủ động ghi `ngaytao = NULL`, nên toa chưa gọi không có giờ gọi giả.
Nguồn chứng từ hiện chưa có giờ thanh toán trong model; `ngaythu` là giờ phát hiện, không khôi phục được giờ thanh toán trước đó.
