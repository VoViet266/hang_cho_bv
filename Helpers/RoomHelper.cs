using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace HangChoKhamBenh.Web.Helpers;

public class CdhaRoomDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Tenphong { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string[] Aliases { get; set; } = [];
}

public static class RoomHelper
{
    public static readonly List<CdhaRoomDefinition> CdhaRooms = new()
    {
        new CdhaRoomDefinition
        {
            Id = "1",
            Tenphong = "Phòng Siêu âm 1",
            ShortName = "Siêu âm 1",
            DisplayName = "Phòng 1 (Phòng Siêu âm 1)",
            Aliases = new[] { "1", "sa1", "phong 1", "phòng 1", "phòng siêu âm 1", "phong sieu am 1" }
        },
        new CdhaRoomDefinition
        {
            Id = "2",
            Tenphong = "Phòng Siêu âm 2",
            ShortName = "Siêu âm 2",
            DisplayName = "Phòng 2 (Phòng Siêu âm 2)",
            Aliases = new[] { "2", "sa2", "phong 2", "phòng 2", "phòng siêu âm 2", "phong sieu am 2" }
        },
        new CdhaRoomDefinition
        {
            Id = "3",
            Tenphong = "Phòng Siêu âm 3",
            ShortName = "Siêu âm 3",
            DisplayName = "Phòng 3 (Phòng Siêu âm 3)",
            Aliases = new[] { "3", "sa3", "phong 3", "phòng 3", "phòng siêu âm 3", "phong sieu am 3" }
        },
        new CdhaRoomDefinition
        {
            Id = "4",
            Tenphong = "Phòng Siêu âm 4",
            ShortName = "Siêu âm 4",
            DisplayName = "Phòng 4 (Phòng Siêu âm 4)",
            Aliases = new[] { "4", "sa4", "phong 4", "phòng 4", "phòng siêu âm 4", "phong sieu am 4" }
        },
        new CdhaRoomDefinition
        {
            Id = "5",
            Tenphong = "Phòng Siêu âm 5",
            ShortName = "Siêu âm 5",
            DisplayName = "Phòng 5 (Phòng Siêu âm 5)",
            Aliases = new[] { "5", "sa5", "phong 5", "phòng 5", "phòng siêu âm 5", "phong sieu am 5" }
        },
        new CdhaRoomDefinition
        {
            Id = "6",
            Tenphong = "Phòng Siêu âm 6",
            ShortName = "Siêu âm 6",
            DisplayName = "Phòng 6 (Phòng Siêu âm 6)",
            Aliases = new[] { "6", "sa6", "phong 6", "phòng 6", "phòng siêu âm 6", "phong sieu am 6" }
        }
    };

    public static readonly string[] DefaultCdhaRooms = new[]
    {
        "Phòng Siêu âm 1",
        "Phòng Siêu âm 2",
        "Phòng Siêu âm 3",
        "Phòng Siêu âm 4"
    };

    public static string NormalizeText(string? str)
    {
        if (string.IsNullOrWhiteSpace(str)) return string.Empty;

        var normalizedString = str.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var stringBuilder = new StringBuilder();

        foreach (var c in normalizedString)
        {
            var unicodeCategory = CharUnicodeInfo.GetUnicodeCategory(c);
            if (unicodeCategory != UnicodeCategory.NonSpacingMark)
            {
                stringBuilder.Append(c);
            }
        }

        var result = stringBuilder.ToString().Normalize(NormalizationForm.FormC);
        return Regex.Replace(result, @"\s+", " ").Trim();
    }

    public static bool IsCdhaRoomParam(string? param)
    {
        if (string.IsNullOrWhiteSpace(param)) return false;
        var p = param.Trim();

        // Khớp dải số '1-4' hoặc '1-2'
        if (Regex.IsMatch(p, @"^[1-6]-[1-6]$")) return true;

        // Khớp số đơn hoặc danh sách phân cách dấu phẩy: '1' hoặc '1,2' hoặc '1,2,3,4'
        if (Regex.IsMatch(p, @"^[1-6](\s*,\s*[1-6])*$")) return true;

        var norm = NormalizeText(p);
        return CdhaRooms.Any(r => r.Aliases.Contains(norm) || NormalizeText(r.Tenphong) == norm);
    }

    public static string ResolveCdhaRoomName(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var raw = input.Trim();
        var norm = NormalizeText(raw);

        // 1. Tìm chính xác theo aliases hoặc id hoặc tenphong
        var found = CdhaRooms.FirstOrDefault(r =>
            r.Id == raw ||
            r.Aliases.Contains(norm) ||
            NormalizeText(r.Tenphong) == norm);

        if (found != null) return found.Tenphong;

        // 2. Tìm số cuối nếu có định dạng "Siêu âm X" hoặc "Phòng X"
        var match = Regex.Match(raw, @"(\d+)");
        if (match.Success)
        {
            var numStr = match.Groups[1].Value;
            var matchByNum = CdhaRooms.FirstOrDefault(r => r.Id == numStr);
            if (matchByNum != null) return matchByNum.Tenphong;
        }

        return raw;
    }

    public static string ResolveCdhaRoomAlias(string? roomName)
    {
        if (string.IsNullOrWhiteSpace(roomName)) return string.Empty;
        var raw = roomName.Trim();
        var norm = NormalizeText(raw);

        var found = CdhaRooms.FirstOrDefault(r =>
            r.Id == raw ||
            r.Aliases.Contains(norm) ||
            NormalizeText(r.Tenphong) == norm);

        if (found != null) return found.Id;

        var match = Regex.Match(raw, @"(\d+)");
        return match.Success ? match.Groups[1].Value : raw;
    }

    public static List<string> ParseCdhaRoomParams(string? param)
    {
        if (string.IsNullOrWhiteSpace(param)) return new List<string>();

        var rawTokens = new List<string>();
        var str = param.Trim();

        // Hỗ trợ dạng dải số 1-4
        var rangeMatch = Regex.Match(str, @"^([1-6])-([1-6])$");
        if (rangeMatch.Success)
        {
            var start = int.Parse(rangeMatch.Groups[1].Value);
            var end = int.Parse(rangeMatch.Groups[2].Value);
            var min = Math.Min(start, end);
            var max = Math.Max(start, end);
            for (var i = min; i <= max; i++)
            {
                rawTokens.Add(i.ToString());
            }
        }
        else
        {
            rawTokens.AddRange(str.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        return rawTokens
            .Select(ResolveCdhaRoomName)
            .Where(s => !string.IsNullOrEmpty(s))
            .Distinct()
            .Take(4)
            .ToList();
    }
}
