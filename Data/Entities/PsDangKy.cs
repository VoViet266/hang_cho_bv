using System.ComponentModel.DataAnnotations.Schema;

namespace HangChoKhamBenh.Web.Data.Entities;

[Table("psdangky", Schema = "current")]
public class PsDangKy
{
    [Column("makb")]
    public string Makb { get; set; } = string.Empty;

    [Column("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [Column("maphong")]
    public string? Maphong { get; set; }

    [Column("ngaydk")]
    public DateTime? Ngaydk { get; set; }

    [Column("xoa")]
    public decimal? Xoa { get; set; }
}
