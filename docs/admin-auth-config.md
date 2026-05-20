# 관리자 인증 설정 분리

관리자 인증은 두 종류의 설정을 분리해서 관리한다.

## 1. 관리자 이메일

실제 OTP 수신 이메일은 `.env`의 `ADMIN_EMAIL`에 둔다.

```env
ADMIN_EMAIL=admin@example.com
```

이 값은 민감한 운영 설정이므로 커밋하지 않는다.

## 2. OTP 정책 템플릿

`data/admin-auth.json`은 민감정보 없는 기본 정책 템플릿이다.

```json
{
  "email": "admin@example.com",
  "otpExpiresInMinutes": 10,
  "otpRequestCooldownSeconds": 60
}
```

운영에서는 `ADMIN_EMAIL`이 있으면 `admin-auth.json`의 `email`보다 우선된다.

## 3. 운영 경로

운영 데이터 루트가 `/var/lib/thecistus`라면 정책 파일은 보통 아래에 둔다.

```text
/var/lib/thecistus/admin-auth.json
```

SMTP가 설정되지 않으면 OTP는 서버 로그에 출력된다. 운영에서는 SMTP 환경변수도 함께 설정한다.
