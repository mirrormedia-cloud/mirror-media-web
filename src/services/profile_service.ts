import { api_client, normalize_envelope, ServiceEnvelope } from '@/lib/api_client';

export interface UserProfileData {
    id: string;
    username: string;
    email: string;
    register_type: string;
    first_name: string;
    last_name: string;
    profile_picture: string | null;
    gender: string | null;
    dob: string | null;
    mobile_country_code: string | null;
    mobile_no: string | null;
    whatsapp_country_code: string | null;
    whatsapp_no: string | null;
    two_step_verification: boolean;
    preferences: Record<string, any>;
}

export async function get_profile(): Promise<ServiceEnvelope<UserProfileData>> {
    const res = await api_client.get('/api/profile/');
    return normalize_envelope(res.data);
}

export async function update_profile(
    data: Partial<Pick<UserProfileData, 'first_name' | 'last_name' | 'gender' | 'dob' | 'mobile_country_code' | 'mobile_no' | 'whatsapp_country_code' | 'whatsapp_no'>>
): Promise<ServiceEnvelope<null>> {
    const res = await api_client.patch('/api/profile/', data);
    return normalize_envelope(res.data);
}

export async function update_profile_picture(file: File): Promise<ServiceEnvelope<{ profile_picture: string }>> {
    const form = new FormData();
    form.append('profile_pic', file);
    const res = await api_client.patch('/api/profile/picture', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return normalize_envelope(res.data);
}

export async function get_profile_pic_upload_url(): Promise<ServiceEnvelope<{ upload_url: string; public_url: string | null }>> {
    const res = await api_client.get('/api/profile/picture/upload-url');
    return normalize_envelope(res.data);
}

export async function confirm_profile_pic(): Promise<ServiceEnvelope<{ profile_picture: string }>> {
    const res = await api_client.post('/api/profile/picture/confirm');
    return normalize_envelope(res.data);
}

/** PUT the blob directly to R2 using the presigned URL (browser → R2, no backend proxy). */
export async function upload_to_r2_direct(upload_url: string, blob: Blob): Promise<void> {
    const res = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
    });
    if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
}
