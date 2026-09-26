using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace HangChoKhamBenh.Web.Data.Entities
{
    [Table("dmphong", Schema = "current")]
    public class DmPhong
    {
        [Key]
        [Column("maphong")]
        public string Maphong { get; set; } = string.Empty;

        [Column("tenphong")]
        public string? Tenphong { get; set; }

        [Column("madv")]
        public string? Madv { get; set; }

        [Column("khoakb")]
        public decimal? Khoakb { get; set; }

        [Column("xoa")]
        public decimal? Xoa { get; set; }
    }
}
