namespace HangChoKhamBenh.Web.Models;

public sealed class DuocQueueSnapshot
{
    public required DuocQueuePageDto All { get; init; }
    public required DuocQueuePageDto Bhyt { get; init; }
    public required DuocQueuePageDto DichVu { get; init; }
    public required List<DuocChuaGiaoItemDto> Input { get; init; }

    public DuocQueuePageDto GetPage(string type)
        => type.Equals("all", StringComparison.OrdinalIgnoreCase) ? All
            : type.Equals("bhyt", StringComparison.OrdinalIgnoreCase) ? Bhyt : DichVu;
}
