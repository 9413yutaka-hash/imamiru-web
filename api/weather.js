const WEATHER_FETCH_TIMEOUT_MILLISECONDS =
  8000;

const WEATHER_API_FORECAST_URL =
  "https://api.weatherapi.com/v1/forecast.json";


// 沖縄県の有人離島を含む地理的範囲(緯度・経度)。マチナウVer1は沖縄県が対象のため、
// 明らかに県外の座標からのWeatherAPI呼び出しをここで足切りする。
// 緯度：八重山諸島南部(波照間島・与那国島、約24.05°N)〜沖縄本島北部の離島
//       (伊平屋島・伊是名島、約26.9°N)まで、余裕を持って24.0〜27.0とする。
// 経度：日本最西端の与那国島(約122.93°E)から、沖縄本島より約400km東方に位置する
//       南大東島・北大東島(約131.2〜131.3°E、沖縄県に属する有人離島)までを
//       カバーする必要があるため、経度方向には非常に広い範囲(122.5〜131.5)になる。
//       これは推測ではなく、大東諸島が実際に沖縄県島尻郡に属する事実に基づく。
// 宮古島・石垣島・西表島・久米島はいずれもこの範囲内に収まる。
const OKINAWA_LATITUDE_MIN = 24.0;
const OKINAWA_LATITUDE_MAX = 27.0;
const OKINAWA_LONGITUDE_MIN = 122.5;
const OKINAWA_LONGITUDE_MAX = 131.5;


// GPS誤差によって同じ地域のユーザーが別キャッシュ扱いになることを防ぐための
// 座標正規化。小数点以下2桁(緯度1度=約111kmなので、約1.11km四方)に丸める。
// WeatherAPI.comの天気予報自体、この程度の距離では通常同じ地域の値を返すため、
// 実用上の天気精度を損なわずにキャッシュ・共有の効きを高められる。
const COORDINATE_ROUNDING_DECIMAL_PLACES = 2;

// 共有キャッシュ(Vercelのサーバー/CDN)の目標保持時間。15分。
const WEATHER_SHARED_CACHE_MAX_AGE_SECONDS = 900;

// s-maxage経過直後の短時間は、古い応答を返しつつ裏で再取得することで、
// キャッシュ切れ直後に大量のリクエストが一斉にWeatherAPI.comへ殺到する
// (thundering herd)事態を緩和する。s-maxageの1/3程度を目安にする。
const WEATHER_SHARED_CACHE_STALE_WHILE_REVALIDATE_SECONDS = 300;

// AIコンシェルジュ Phase2｜forecast.json?days=2で取得済みの当日分
// forecastday[0].hour[](24時間分)のうち、現在時刻以降の分だけを
// 必要最小限の項目に絞って返す。追加APIコールは発生しない(既存の
// 1回の呼び出しレスポンスに元々含まれていたが、今まで読み捨てていた
// データを使うだけ)。24時間全部をAIへ渡すとトークンを浪費するため、
// 直近WEATHER_NEXT_HOURS_MAX_COUNT件までに絞る。深夜など当日分の残り
// 時間がほとんど無い場合はそのまま少ない件数(0件もありうる)を返す。
const WEATHER_NEXT_HOURS_MAX_COUNT = 6;

// マチナウAI旅行相棒化 Phase1.1｜明日分(forecastday[1])は「現在時刻から
// 何時間後」という基準が存在しない(まだ来ていない1日全体のため)。
// ユーザー発言から対象時刻を解析する専用の仕組みは新設せず(本部指示)、
// 旅行相談で意味を持つ代表的な時間帯だけを固定チェックポイントとして
// 抽出する、最小かつ安全な方式にする。
const TOMORROW_HOURS_CHECKPOINT_TIMES =
  ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];


function parseCoordinateQueryParam(
  rawValue,
  minValue,
  maxValue
) {
  if (
    typeof rawValue !== "string" ||
    rawValue.trim() === ""
  ) {
    return null;
  }

  const numericValue =
    Number(
      rawValue
    );

  if (
    !Number.isFinite(
      numericValue
    )
  ) {
    return null;
  }

  if (
    numericValue < minValue ||
    numericValue > maxValue
  ) {
    return null;
  }

  return numericValue;
}


function isWithinOkinawaBounds(
  latitude,
  longitude
) {
  return (
    latitude >= OKINAWA_LATITUDE_MIN &&
    latitude <= OKINAWA_LATITUDE_MAX &&
    longitude >= OKINAWA_LONGITUDE_MIN &&
    longitude <= OKINAWA_LONGITUDE_MAX
  );
}


function roundCoordinateForCaching(
  value
) {
  const roundingFactor =
    Math.pow(
      10,
      COORDINATE_ROUNDING_DECIMAL_PLACES
    );

  return (
    Math.round(
      value * roundingFactor
    ) / roundingFactor
  );
}


function toFiniteNumberOrNull(
  value
) {
  const numericValue =
    Number(
      value
    );

  return Number.isFinite(
    numericValue
  )
    ? numericValue
    : null;
}


function normalizeWeatherApiResponse(
  weatherApiData
) {
  if (
    !weatherApiData ||
    typeof weatherApiData !== "object"
  ) {
    return null;
  }

  const current =
    weatherApiData.current;

  if (
    !current ||
    typeof current !== "object"
  ) {
    return null;
  }

  const location =
    weatherApiData.location &&
    typeof weatherApiData.location === "object"
      ? weatherApiData.location
      : {};

  const condition =
    current.condition &&
    typeof current.condition === "object"
      ? current.condition
      : {};

  const forecastDayList =
    weatherApiData.forecast &&
    Array.isArray(
      weatherApiData.forecast.forecastday
    )
      ? weatherApiData.forecast.forecastday
      : [];

  const forecastDay =
    forecastDayList.length > 0
      ? forecastDayList[0]
      : null;

  // マチナウAI旅行相棒化 Phase1.1｜forecastday[1]が明日分。days=2への
  // 変更で取得できるようになったが、配列が短い(WeatherAPI側の一時的な
  // 問題等)場合は安全にnullへフォールバックする(例外を投げない)。
  const tomorrowForecastDay =
    forecastDayList.length > 1
      ? forecastDayList[1]
      : null;

  const chanceOfRain =
    forecastDay &&
    forecastDay.day &&
    typeof forecastDay.day === "object"
      ? toFiniteNumberOrNull(
          forecastDay.day.daily_chance_of_rain
        )
      : null;

  const nextHours =
    extractNextHoursFromForecastDay(
      forecastDay,
      weatherApiData.location
    );

  // マチナウAI旅行相棒化 Phase1.1｜今回の誤答(今日21時/22時のデータを
  // 明日の判断に使った)の根本原因が「時刻だけで日付が無い」ことだった
  // ため、明日分は日付ラベル必須の固定チェックポイント抽出にする。
  // ユーザー発言から対象時刻を解析する仕組みは新設しない(本部指示)。
  const tomorrowHours =
    extractTomorrowCheckpointHours(
      tomorrowForecastDay
    );

  // マチナウAI旅行相棒化 Phase1｜forecastday[0].astroは既存の1回の
  // forecast.json呼び出しに元々含まれているが、これまで抽出していな
  // かった。追加のAPI呼び出しは発生しない。sunset/sunriseが取得できない
  // 形式の場合は空文字にし、AI側で日没時刻を創作させない(存在しない値を
  // 断定材料にしない設計)。
  const astro =
    forecastDay &&
    forecastDay.astro &&
    typeof forecastDay.astro === "object"
      ? forecastDay.astro
      : {};

  const sunset =
    typeof astro.sunset === "string"
      ? astro.sunset
      : "";

  const sunrise =
    typeof astro.sunrise === "string"
      ? astro.sunrise
      : "";

  // マチナウAI旅行相棒化 Phase1.1｜明日分のastro(同じ1回のレスポンスに
  // 元々含まれる)。tomorrowForecastDayが無い場合は空文字にし、today側と
  // 混同されないよう別名のフィールドにする。
  const tomorrowAstro =
    tomorrowForecastDay &&
    tomorrowForecastDay.astro &&
    typeof tomorrowForecastDay.astro === "object"
      ? tomorrowForecastDay.astro
      : {};

  const tomorrowSunset =
    typeof tomorrowAstro.sunset === "string"
      ? tomorrowAstro.sunset
      : "";

  const tomorrowSunrise =
    typeof tomorrowAstro.sunrise === "string"
      ? tomorrowAstro.sunrise
      : "";

  return {
    locationName:
      typeof location.name === "string"
        ? location.name
        : "",

    conditionText:
      typeof condition.text === "string"
        ? condition.text
        : "",

    conditionCode:
      toFiniteNumberOrNull(
        condition.code
      ),

    temperatureC:
      toFiniteNumberOrNull(
        current.temp_c
      ),

    feelsLikeC:
      toFiniteNumberOrNull(
        current.feelslike_c
      ),

    heatIndexC:
      toFiniteNumberOrNull(
        current.heatindex_c
      ),

    chanceOfRain:
      chanceOfRain,

    precipitationMm:
      toFiniteNumberOrNull(
        current.precip_mm
      ),

    windKph:
      toFiniteNumberOrNull(
        current.wind_kph
      ),

    gustKph:
      toFiniteNumberOrNull(
        current.gust_kph
      ),

    uvIndex:
      toFiniteNumberOrNull(
        current.uv
      ),

    // AIコンシェルジュ Phase2｜「このあとどうなるか」の判断材料。
    // 現在時刻より前の時間帯は含めない(過去の予報を渡しても無意味なため)。
    nextHours:
      nextHours,

    // マチナウAI旅行相棒化 Phase1｜日没/日の出の判断材料(WeatherAPIの
    // 既存レスポンスの文字列表記のままにする。時刻計算・タイムゾーン変換は
    // 行わない。取得できない場合は空文字のままにし、AI側で創作させない)。
    sunset:
      sunset,

    sunrise:
      sunrise,

    // マチナウAI旅行相棒化 Phase1.1｜明日分。tomorrowForecastDayが
    // 取得できない場合はtomorrowHours=[]・sunset/sunrise=""のまま
    // (例外を投げず安全にフォールバックする)。
    tomorrowHours:
      tomorrowHours,

    tomorrowSunset:
      tomorrowSunset,

    tomorrowSunrise:
      tomorrowSunrise,

    updatedAt:
      new Date().toISOString()
  };
}


// forecastDay.hour[](24時間分、WeatherAPIの既存レスポンスに元々含まれる)
// から、現在時刻(そのロケーションのローカル時刻epoch)以降の時間帯だけを
// 抜き出し、AIが行動判断に使う最小限の項目だけに絞って返す。
// location.localtime_epochを基準にする(Vercel実行環境のサーバー時計では
// なく、その座標のローカル時刻を使うことで、日付境界のズレを防ぐ)。
function extractNextHoursFromForecastDay(
  forecastDay,
  location
) {
  if (
    !forecastDay ||
    !Array.isArray(
      forecastDay.hour
    )
  ) {
    return [];
  }

  const localTimeEpoch =
    location &&
    typeof location === "object" &&
    typeof location.localtime_epoch === "number"
      ? location.localtime_epoch
      : Math.floor(
          Date.now() / 1000
        );

  const upcomingHours =
    forecastDay.hour.filter(
      function(hourEntry) {
        return (
          hourEntry &&
          typeof hourEntry.time_epoch === "number" &&
          hourEntry.time_epoch >=
            localTimeEpoch
        );
      }
    );

  return upcomingHours
    .slice(
      0,
      WEATHER_NEXT_HOURS_MAX_COUNT
    )
    .map(
      function(hourEntry) {
        // hour[].timeは"2026-09-13 15:00"形式のローカル時刻文字列。
        // 時刻部分(HH:MM)だけを取り出す(日付は現在時刻からの近さで
        // 自明なため渡さない、トークン節約)。
        const timeLabel =
          typeof hourEntry.time === "string" &&
          hourEntry.time.includes(" ")
            ? hourEntry.time.split(" ")[1]
            : "";

        const hourCondition =
          hourEntry.condition &&
          typeof hourEntry.condition === "object"
            ? hourEntry.condition
            : {};

        return {
          // マチナウAI旅行相棒化 Phase1.1｜「21時」「22時」等の時刻だけが
          // 独立して見え、別の日の判断に誤用される事故を防ぐため、
          // 既存のtime形式(HH:MM、後方互換のため変更しない)に加えて
          // 必ずdate(YYYY-MM-DD)を付与する。
          date:
            typeof forecastDay.date === "string"
              ? forecastDay.date
              : "",

          time: timeLabel,

          chanceOfRain:
            toFiniteNumberOrNull(
              hourEntry.chance_of_rain
            ),

          condition:
            typeof hourCondition.text === "string"
              ? hourCondition.text
              : "",

          temperatureC:
            toFiniteNumberOrNull(
              hourEntry.temp_c
            ),

          windKph:
            toFiniteNumberOrNull(
              hourEntry.wind_kph
            )
        };
      }
    );
}


// マチナウAI旅行相棒化 Phase1.1｜明日分(forecastday[1])専用の抽出。
// 「現在時刻から何時間後か」という基準は今日にしか存在しないため、
// 旅行相談で意味を持つ代表的な時間帯(TOMORROW_HOURS_CHECKPOINT_TIMES)
// だけを固定的に抜き出す、最小かつ安全な方式にする(ユーザー発言からの
// 時刻解析システムは新設しない、本部指示)。tomorrowForecastDayが
// 存在しない場合は例外を投げず空配列を返す。
function extractTomorrowCheckpointHours(
  tomorrowForecastDay
) {
  if (
    !tomorrowForecastDay ||
    !Array.isArray(
      tomorrowForecastDay.hour
    )
  ) {
    return [];
  }

  const tomorrowDate =
    typeof tomorrowForecastDay.date === "string"
      ? tomorrowForecastDay.date
      : "";

  const checkpointHours =
    [];

  TOMORROW_HOURS_CHECKPOINT_TIMES.forEach(
    function(checkpointTime) {
      const matchedHourEntry =
        tomorrowForecastDay.hour.find(
          function(hourEntry) {
            return (
              hourEntry &&
              typeof hourEntry.time === "string" &&
              hourEntry.time.includes(" ") &&
              hourEntry.time.split(" ")[1] === checkpointTime
            );
          }
        );

      if (!matchedHourEntry) {
        return;
      }

      const hourCondition =
        matchedHourEntry.condition &&
        typeof matchedHourEntry.condition === "object"
          ? matchedHourEntry.condition
          : {};

      checkpointHours.push(
        {
          date: tomorrowDate,
          time: checkpointTime,

          chanceOfRain:
            toFiniteNumberOrNull(
              matchedHourEntry.chance_of_rain
            ),

          condition:
            typeof hourCondition.text === "string"
              ? hourCondition.text
              : "",

          temperatureC:
            toFiniteNumberOrNull(
              matchedHourEntry.temp_c
            ),

          windKph:
            toFiniteNumberOrNull(
              matchedHourEntry.wind_kph
            )
        }
      );
    }
  );

  return checkpointHours;
}


export default async function handler(
  request,
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (
    request.method !== "GET"
  ) {
    response.setHeader(
      "Allow",
      "GET"
    );

    return response.status(405).json({
      success: false,
      message:
        "GETのみ利用できます。"
    });
  }

  const rawLatitude =
    request.query &&
    typeof request.query.lat === "string"
      ? request.query.lat
      : "";

  const rawLongitude =
    request.query &&
    typeof request.query.lon === "string"
      ? request.query.lon
      : "";

  const latitude =
    parseCoordinateQueryParam(
      rawLatitude,
      -90,
      90
    );

  const longitude =
    parseCoordinateQueryParam(
      rawLongitude,
      -180,
      180
    );

  if (
    latitude === null ||
    longitude === null
  ) {
    return response.status(400).json({
      success: false,
      message:
        "緯度・経度の指定が正しくありません。"
    });
  }

  if (
    !isWithinOkinawaBounds(
      latitude,
      longitude
    )
  ) {
    return response.status(400).json({
      success: false,
      message:
        "対象地域外の座標です。"
    });
  }

  const roundedLatitude =
    roundCoordinateForCaching(
      latitude
    );

  const roundedLongitude =
    roundCoordinateForCaching(
      longitude
    );

  const weatherApiKey =
    process.env.WEATHERAPI_KEY;

  if (!weatherApiKey) {
    console.error(
      "WEATHERAPI_KEY が設定されていません。"
    );

    return response.status(500).json({
      success: false,
      message:
        "天候情報を取得できません。時間をおいて、もう一度お試しください。"
    });
  }

  const requestUrl =
    new URL(
      WEATHER_API_FORECAST_URL
    );

  requestUrl.searchParams.set(
    "key",
    weatherApiKey
  );

  requestUrl.searchParams.set(
    "q",
    roundedLatitude + "," + roundedLongitude
  );

  // マチナウAI旅行相棒化 Phase1.1｜本部確認済みの公式仕様により、
  // days=2でも1リクエスト＝1コールのまま(呼び出し回数・料金は増えない)。
  // forecastday[1](明日分)を取得するために2へ変更する。
  requestUrl.searchParams.set(
    "days",
    "2"
  );

  requestUrl.searchParams.set(
    "aqi",
    "no"
  );

  requestUrl.searchParams.set(
    "alerts",
    "no"
  );

  requestUrl.searchParams.set(
    "lang",
    "ja"
  );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      WEATHER_FETCH_TIMEOUT_MILLISECONDS
    );

  try {
    let weatherApiResponse;

    try {
      weatherApiResponse =
        await fetch(
          requestUrl,
          {
            signal:
              controller.signal
          }
        );
    } catch (fetchError) {
      throw new Error(
        fetchError.name === "AbortError"
          ? "天候情報の取得がタイムアウトしました。"
          : "天候情報の取得に失敗しました。"
      );
    }

    if (
      !weatherApiResponse.ok
    ) {
      throw new Error(
        "天候情報の取得に失敗しました。(status " +
        weatherApiResponse.status +
        ")"
      );
    }

    let weatherApiData;

    try {
      weatherApiData =
        await weatherApiResponse.json();
    } catch (parseError) {
      throw new Error(
        "天候情報の解析に失敗しました。"
      );
    }

    const normalizedWeather =
      normalizeWeatherApiResponse(
        weatherApiData
      );

    if (!normalizedWeather) {
      throw new Error(
        "天候情報の形式が正しくありません。"
      );
    }

    // 成功時のみ、Vercelの共有キャッシュ(CDN)で複数ユーザー間の応答を
    // 再利用できるようにする。エラー応答はno-storeのまま(デフォルト)で、
    // 失敗した結果がキャッシュされて他ユーザーへ配信されることを防ぐ。
    response.setHeader(
      "Cache-Control",
      "public, max-age=" +
        WEATHER_SHARED_CACHE_MAX_AGE_SECONDS +
        ", s-maxage=" +
        WEATHER_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        WEATHER_SHARED_CACHE_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).json({
      success: true,
      weather:
        normalizedWeather
    });
  } catch (error) {
    console.error(
      "天候情報の取得エラー：",
      error
    );

    return response.status(502).json({
      success: false,
      message:
        "天候情報の取得に失敗しました。時間をおいて、もう一度お試しください。"
    });
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}
