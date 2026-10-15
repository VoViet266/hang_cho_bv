namespace HangChoKhamBenh.Web.Models;

public enum DuocScanAction { NoPending, CallPayment, WaitPayment, CallPickup, Dispense }

public record DuocScanState(int Khochan, string? OCua);

public static class DuocScanWorkflow
{
    public const string PaymentWindow = "5";
    public const string PickupWindow = "3";

    public static DuocScanAction NextAction(IReadOnlyCollection<DuocScanState> pending, bool servicePaid)
    {
        if (pending.Count == 0) return DuocScanAction.NoPending;

        var service = pending.Where(p => p.Khochan == DuocKhoConstant.DichVu).ToList();
        if (service.Count > 0 && !servicePaid)
        {
            return DuocScanAction.CallPayment;
        }

        return pending.Any(p => p.OCua?.Trim() != PickupWindow)
            ? DuocScanAction.CallPickup : DuocScanAction.Dispense;
    }

    public static bool IsVisibleOnDisplay(bool hasService, bool servicePaid, string? window)
        => hasService && !servicePaid || window?.Trim() == PickupWindow;
}
