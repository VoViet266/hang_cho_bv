using System.ComponentModel.DataAnnotations.Schema;

namespace HangChoKhamBenh.Web.Data.Entities;

[Table("chungtu", Schema = "current")]
public class ChungTu
{
    [Column("sohd")]
    public string? Sohd { get; set; }

    [Column("mabn")]
    public string? Mabn { get; set; }

    [Column("makh")]
    public string? Makh { get; set; }

    [Column("maba")]
    public string? Maba { get; set; }

    [Column("khochan")]
    public string? Khochan { get; set; }

    [Column("taikhoan")]
    public string? Taikhoan { get; set; }

    [Column("tienvat")]
    public decimal? Tienvat { get; set; }

    [Column("dathu")]
    public decimal? Dathu { get; set; }

    [Column("ngaylap")]
    public DateTime? Ngaylap { get; set; }

    [Column("dain")]
    public int Dain { get; set; } = 0;

    [Column("xoa")]
    public decimal? Xoa { get; set; }
}