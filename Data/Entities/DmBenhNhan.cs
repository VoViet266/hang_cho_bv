using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace HangChoKhamBenh.Web.Data.Entities;

[Table("dmbenhnhan", Schema = "current")]
public class DmBenhNhan
{
    [Key]
    [Column("mabn")]
    public string Mabn { get; set; } = string.Empty;

    [Column("holot")]
    public string Holot { get; set; } = string.Empty;

    [Column("ten")]
    public string Ten { get; set; } = string.Empty;

    [Column("ngaysinh", TypeName = "date")]
    public DateTime? Ngaysinh { get; set; }

    [Column("gioitinh")]
    public decimal? Gioitinh { get; set; }

    [Column("xoa")]
    public decimal? Xoa { get; set; }
}
