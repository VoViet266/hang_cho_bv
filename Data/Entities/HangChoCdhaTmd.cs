using System.ComponentModel.DataAnnotations.Schema;

namespace HangChoKhamBenh.Web.Data.Entities;

[Table("hangchocdha_tmd", Schema = "current")]
public class HangChoCdhaTmd
{
    [Column("makb")]
    public string? Makb { get; set; }

    [Column("mabn")]
    public string? Mabn { get; set; }

    [Column("maba")]
    public string? Maba { get; set; }

    [Column("ngaynhap")]
    public DateTime? Ngaynhap { get; set; }

    [Column("ngaykq")]
    public DateTime? Ngaykq { get; set; }

    [Column("uutien")]
    public string? Uutien { get; set; }

    [Column("maloai")]
    public string? Maloai { get; set; }

    [Column("tenphong")]
    public string? Tenphong { get; set; }

    [Column("xoa")]
    public decimal? Xoa { get; set; }

    [Column("phongchidinh")]
    public string? Phongchidinh { get; set; }

    [Column("ghichu")]
    public string? Ghichu { get; set; }

    [Column("idchidinh")]
    public string? Idchidinh { get; set; }

    [Column("an")]
    public string? An { get; set; }

    [Column("taikhoan")]
    public string? Taikhoan { get; set; }

    [Column("thoigiantao")]
    public DateTime? Thoigiantao { get; set; }
}
