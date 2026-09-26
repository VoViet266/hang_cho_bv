using System.ComponentModel.DataAnnotations.Schema;

namespace HangChoKhamBenh.Web.Data.Entities
{
    [Table("hangchoduoc_tmd", Schema = "current")]
    public class HangChoDuocTmd
    {
        [Column("mabn")]
        public string Mabn { get; set; } = string.Empty;

        [Column("makb")]
        public string Makb { get; set; } = string.Empty;

        [Column("ngaynhap")]
        public DateTime? Ngaynhap { get; set; }

        [Column("ngaygiao")]
        public DateTime Ngaygiao { get; set; }

        [Column("taikhoan")]
        public string? Taikhoan { get; set; }

        [Column("khochan")]
        public int Khochan { get; set; }

        [Column("xoa")]
        public decimal Xoa { get; set; } = 0;

        [Column("ngaykcb")]
        public DateTime? Ngaykcb { get; set; }

        [Column("maba")]
        public string? Maba { get; set; }

        [Column("dagiao")]
        public decimal Dagiao { get; set; } = 0;

        [Column("dathu")]
        public bool? Dathu { get; set; } = false;
    }
}
