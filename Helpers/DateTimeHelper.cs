namespace HangChoKhamBenh.Web.Helpers
{
    public static class DateTimeHelper
    {
        public static DateTime? ToDateTimeNullable(object? val)
        {
            if (val == null || val is DBNull) return null;
            if (val is DateTime dt) return dt;
            if (val is DateOnly d) return d.ToDateTime(TimeOnly.MinValue);
            if (DateTime.TryParse(val.ToString(), out var parsed)) return parsed;
            return null;
        }
    }
}
