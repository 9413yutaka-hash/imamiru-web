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

  const forecastDay =
    weatherApiData.forecast &&
    Array.isArray(
      weatherApiData.forecast.forecastday
    ) &&
    weatherApiData.forecast.forecastday.length > 0
      ? weatherApiData.forecast.forecastday[0]
      : null;

  const chanceOfRain =
    forecastDay &&
    forecastDay.day &&
    typeof forecastDay.day === "object"
      ? toFiniteNumberOrNull(
          forecastDay.day.daily_chance_of_rain
        )
      : null;

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

    updatedAt:
      new Date().toISOString()
  };
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

  requestUrl.searchParams.set(
    "days",
    "1"
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
