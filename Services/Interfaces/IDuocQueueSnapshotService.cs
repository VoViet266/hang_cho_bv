using HangChoKhamBenh.Web.Models;

namespace HangChoKhamBenh.Web.Services;

public interface IDuocQueueSnapshotService
{
    Task<DuocQueueSnapshot> LoadAsync();
}
