using System.ComponentModel.DataAnnotations.Schema;

namespace HangChoKhamBenh.Web.Data.Entities;

[Table("khambenh", Schema = "current")]
public class KhamBenh
{
    [Column("makb")]
    public string Makb { get; set; } = string.Empty;

    [Column("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [Column("maphong")]
    public string? Maphong { get; set; }

    [Column("ngaykcb")]
    public DateTime? Ngaykcb { get; set; }

    [Column("dakham")]
    public decimal? Dakham { get; set; }

    [Column("xoa")]
    public decimal? Xoa { get; set; }
}
