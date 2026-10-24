-- Thời gian theo cấu hình môi trường và phiên kết nối ban đầu.
-- Bảng đã tồn tại: giữ dữ liệu và các index hiện có, chỉ bỏ default của ngaytao.
BEGIN;

CREATE TABLE IF NOT EXISTS current.hangchoduoc_tmd
(
    mabn          varchar NOT NULL,                         -- Mã bệnh nhân.
    makb          varchar NOT NULL,                         -- Mã lượt khám; một lượt có thể có cả kho 13 và 14.
    ngaynhap      timestamp with time zone,                -- Quét lần đầu, tiếp nhận vào hàng chờ.
    ngaygiao      timestamp with time zone,                -- Thực phát thuốc; còn chờ/không mua thì NULL.
    taikhoan      varchar,                                 -- Code hiện dùng lưu ô gọi: '5' thu tiền, '3' nhận thuốc.
    khochan       integer NOT NULL,                        -- 13: dịch vụ; 14: BHYT.
    xoa           numeric DEFAULT 0 NOT NULL,               -- 0: còn hiệu lực; 1: xóa mềm.
    ngaykcb       timestamp with time zone,                -- Thời điểm khám lấy từ lượt khám nguồn.
    maba          varchar,                                 -- Mã bệnh án nếu có.
    sohd          varchar,                                 -- Mã hóa đơn/toa nguồn trong cùng lượt khám.
    dagiao        numeric DEFAULT 0 NOT NULL,               -- 0: chờ; 1: đã phát; 3: không mua.
    dathu         boolean DEFAULT false,                   -- Dịch vụ: đồng bộ chứng từ. BHYT: true để chờ phát.
    an            integer DEFAULT 0 NOT NULL,               -- 0: hiện; 1: ẩn, không thay đổi trạng thái phát.
    macho         integer GENERATED ALWAYS AS IDENTITY
        CONSTRAINT hangchoduoc_tmd_pk PRIMARY KEY,         -- Khóa riêng cho từng dòng/kho.
    ngaytao       timestamp without time zone,             -- Giờ địa phương của lần gọi/gọi lại gần nhất; chưa gọi: NULL.
    ngaythu       timestamp with time zone,                -- Lần đầu phát hiện dịch vụ đã thu tiền.
    ngayhoanthanh timestamp with time zone                 -- Kết thúc xử lý: đã phát hoặc không mua.
);

-- Không dùng DEFAULT now(): tiếp nhận toa chưa có nghĩa là đã gọi tên.
ALTER TABLE current.hangchoduoc_tmd ALTER COLUMN ngaytao DROP DEFAULT;
ALTER TABLE current.hangchoduoc_tmd ADD COLUMN IF NOT EXISTS sohd varchar;

COMMENT ON COLUMN current.hangchoduoc_tmd.mabn IS 'Mã bệnh nhân';
COMMENT ON COLUMN current.hangchoduoc_tmd.makb IS 'Mã lượt khám; một lượt có thể chứa nhiều toa';
COMMENT ON COLUMN current.hangchoduoc_tmd.ngaynhap IS 'Thời điểm quét tiếp nhận lần đầu; giữ nguyên khi gọi lại, ẩn hoặc hoàn tác';
COMMENT ON COLUMN current.hangchoduoc_tmd.ngaygiao IS 'Thời điểm thực phát thuốc; NULL nếu còn chờ hoặc không mua';
COMMENT ON COLUMN current.hangchoduoc_tmd.taikhoan IS 'Ô được gọi theo code hiện tại: 5 thu tiền, 3 nhận thuốc; NULL khi chưa gọi';
COMMENT ON COLUMN current.hangchoduoc_tmd.khochan IS 'Kho 13 dịch vụ, kho 14 BHYT; mỗi kho là một dòng';
COMMENT ON COLUMN current.hangchoduoc_tmd.xoa IS '0 còn hiệu lực, 1 xóa mềm';
COMMENT ON COLUMN current.hangchoduoc_tmd.ngaykcb IS 'Ngày giờ khám từ nguồn lượt khám';
COMMENT ON COLUMN current.hangchoduoc_tmd.maba IS 'Mã bệnh án nếu có';
COMMENT ON COLUMN current.hangchoduoc_tmd.sohd IS 'Mã hóa đơn/toa nguồn; dùng phân biệt nhiều toa cùng lượt khám';
COMMENT ON COLUMN current.hangchoduoc_tmd.dagiao IS '0 chờ phát, 1 đã phát, 3 không mua';
COMMENT ON COLUMN current.hangchoduoc_tmd.dathu IS 'Dịch vụ đồng bộ trạng thái đã thu; BHYT true để bỏ qua bước thu dịch vụ';
COMMENT ON COLUMN current.hangchoduoc_tmd.an IS '0 hiển thị, 1 ẩn; độc lập với trạng thái phát và các mốc thời gian';
COMMENT ON COLUMN current.hangchoduoc_tmd.macho IS 'Khóa chính tự tăng cho từng dòng hàng chờ';
COMMENT ON COLUMN current.hangchoduoc_tmd.ngaytao IS 'Giờ gọi tên/gọi lại gần nhất; dùng xếp màn hình; chưa gọi NULL';
COMMENT ON COLUMN current.hangchoduoc_tmd.ngaythu IS 'Lần đầu ứng dụng phát hiện dịch vụ đã thu tiền; BHYT thuần NULL';
COMMENT ON COLUMN current.hangchoduoc_tmd.ngayhoanthanh IS 'Thời điểm kết thúc xử lý đã phát/không mua; hoàn tác thì xóa mốc này';
COMMIT;
