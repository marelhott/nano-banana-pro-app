import React, { useState } from 'react';

export interface JsonPromptData {
    subject: {
        main: string;
        details: string[];
        pose_or_action: string;
    };
    environment: {
        location: string;
        atmosphere: string;
        time_of_day: string;
    };
    lighting: {
        type: 'natural' | 'studio' | 'dramatic' | 'ambient' | '';
        direction: string;
        quality: 'soft' | 'hard' | 'diffused' | '';
        color_temperature: 'warm' | 'cool' | 'neutral' | '';
    };
    camera: {
        angle: 'eye_level' | 'high_angle' | 'low_angle' | 'birds_eye' | '';
        focal_length: '24mm' | '35mm' | '50mm' | '85mm' | '200mm' | '';
        depth_of_field: 'shallow' | 'deep' | '';
        composition: string;
    };
    aesthetic: {
        medium: 'photograph' | 'painting' | 'illustration' | '3d_render' | '';
        style: string;
        color_palette: string;
        mood: string;
    };
    technical: {
        quality: string;
        resolution_hint: string;
    };
}

export const getEmptyJsonData = (): JsonPromptData => ({
    subject: {
        main: '',
        details: [],
        pose_or_action: ''
    },
    environment: {
        location: '',
        atmosphere: '',
        time_of_day: ''
    },
    lighting: {
        type: '',
        direction: '',
        quality: '',
        color_temperature: ''
    },
    camera: {
        angle: '',
        focal_length: '',
        depth_of_field: '',
        composition: ''
    },
    aesthetic: {
        medium: '',
        style: '',
        color_palette: '',
        mood: ''
    },
    technical: {
        quality: 'high detail photorealistic',
        resolution_hint: '8k ultra detailed'
    }
});

interface Props {
    data: JsonPromptData;
    onChange: (data: JsonPromptData) => void;
}

export const JsonPromptEditor: React.FC<Props> = ({ data, onChange }) => {
    const [openSections, setOpenSections] = useState<Set<string>>(new Set(['subject']));

    const toggleSection = (section: string) => {
        const newOpen = new Set(openSections);
        if (newOpen.has(section)) {
            newOpen.delete(section);
        } else {
            newOpen.add(section);
        }
        setOpenSections(newOpen);
    };

    const updateData = (path: string[], value: any) => {
        const newData = { ...data };
        let current: any = newData;

        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;

        onChange(newData);
    };

    const SectionHeader = ({ section, icon, title }: { section: string; icon: string; title: string }) => (
        <button
            onClick={() => toggleSection(section)}
            className="w-full px-3 py-2 bg-monstera-50 hover:bg-monstera-100 border-b border-monstera-200 flex items-center justify-between transition-colors"
        >
            <div className="flex items-center gap-2">
                <span className="text-sm">{icon}</span>
                <span className="text-[10px] font-black text-monstera-800 uppercase tracking-widest">{title}</span>
            </div>
            <svg
                className={`w-3 h-3 text-monstera-600 transition-transform ${openSections.has(section) ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
        </button>
    );

    const inputClass = "w-full bg-white border border-monstera-200 text-[11px] rounded px-2 py-1.5 outline-none focus:border-monstera-400 transition-colors";
    const labelClass = "text-[9px] text-monstera-700 font-bold uppercase tracking-wider";

    return (
        <div className="space-y-2">
            {/* Subject Block */}
            <div className="border border-monstera-200 rounded-md overflow-hidden shadow-sm">
                <SectionHeader section="subject" icon="📷" title="Subject" />
                {openSections.has('subject') && (
                    <div className="p-3 space-y-2 bg-white">
                        <div>
                            <label className={labelClass}>Main Subject</label>
                            <input
                                type="text"
                                placeholder="e.g., woman in her 30s"
                                className={inputClass}
                                value={data.subject.main}
                                onChange={(e) => updateData(['subject', 'main'], e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Details (one per line)</label>
                            <textarea
                                placeholder="e.g., casual clothing&#10;natural expression&#10;brown hair"
                                className={`${inputClass} min-h-[60px] resize-none`}
                                value={data.subject.details.join('\n')}
                                onChange={(e) => updateData(['subject', 'details'], e.target.value.split('\n').filter(d => d.trim()))}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Pose / Action</label>
                            <input
                                type="text"
                                placeholder="e.g., sitting, relaxed posture"
                                className={inputClass}
                                value={data.subject.pose_or_action}
                                onChange={(e) => updateData(['subject', 'pose_or_action'], e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Environment Block */}
            <div className="border border-monstera-200 rounded-md overflow-hidden shadow-sm">
                <SectionHeader section="environment" icon="🌍" title="Environment" />
                {openSections.has('environment') && (
                    <div className="p-3 space-y-2 bg-white">
                        <div>
                            <label className={labelClass}>Location</label>
                            <input
                                type="text"
                                placeholder="e.g., modern cafe interior"
                                className={inputClass}
                                value={data.environment.location}
                                onChange={(e) => updateData(['environment', 'location'], e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Atmosphere</label>
                            <input
                                type="text"
                                placeholder="e.g., cozy, morning ambiance"
                                className={inputClass}
                                value={data.environment.atmosphere}
                                onChange={(e) => updateData(['environment', 'atmosphere'], e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Time of Day</label>
                            <select
                                className={inputClass}
                                value={data.environment.time_of_day}
                                onChange={(e) => updateData(['environment', 'time_of_day'], e.target.value)}
                            >
                                <option value="">Select...</option>
                                <option value="morning">Morning</option>
                                <option value="afternoon">Afternoon</option>
                                <option value="evening">Evening</option>
                                <option value="night">Night</option>
                                <option value="golden hour">Golden Hour</option>
                                <option value="blue hour">Blue Hour</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Lighting Block */}
            <div className="border border-monstera-200 rounded-md overflow-hidden shadow-sm">
                <SectionHeader section="lighting" icon="💡" title="Lighting" />
                {openSections.has('lighting') && (
                    <div className="p-3 space-y-2 bg-white">
                        <div>
                            <label className={labelClass}>Type</label>
                            <div className="flex gap-1">
                                {['natural', 'studio', 'dramatic', 'ambient'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => updateData(['lighting', 'type'], type)}
                                        className={`flex-1 px-2 py-1 text-[9px] font-bold uppercase rounded transition-all ${data.lighting.type === type
                                                ? 'bg-monstera-500 text-white shadow-sm'
                                                : 'bg-monstera-50 text-monstera-700 hover:bg-monstera-100'
                                            }`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Direction</label>
                            <input
                                type="text"
                                placeholder="e.g., from left, 45 degrees"
                                className={inputClass}
                                value={data.lighting.direction}
                                onChange={(e) => updateData(['lighting', 'direction'], e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Quality</label>
                            <div className="flex gap-1">
                                {['soft', 'hard', 'diffused'].map(quality => (
                                    <button
                                        key={quality}
                                        onClick={() => updateData(['lighting', 'quality'], quality)}
                                        className={`flex-1 px-2 py-1 text-[9px] font-bold uppercase rounded transition-all ${data.lighting.quality === quality
                                                ? 'bg-monstera-500 text-white shadow-sm'
                                                : 'bg-monstera-50 text-monstera-700 hover:bg-monstera-100'
                                            }`}
                                    >
                                        {quality}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Color Temperature</label>
                            <div className="flex gap-1">
                                {['warm', 'cool', 'neutral'].map(temp => (
                                    <button
                                        key={temp}
                                        onClick={() => updateData(['lighting', 'color_temperature'], temp)}
                                        className={`flex-1 px-2 py-1 text-[9px] font-bold uppercase rounded transition-all ${data.lighting.color_temperature === temp
                                                ? 'bg-monstera-500 text-white shadow-sm'
                                                : 'bg-monstera-50 text-monstera-700 hover:bg-monstera-100'
                                            }`}
                                    >
                                        {temp}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Camera Block */}
            <div className="border border-monstera-200 rounded-md overflow-hidden shadow-sm">
                <SectionHeader section="camera" icon="📸" title="Camera" />
                {openSections.has('camera') && (
                    <div className="p-3 space-y-2 bg-white">
                        <div>
                            <label className={labelClass}>Angle</label>
                            <select
                                className={inputClass}
                                value={data.camera.angle}
                                onChange={(e) => updateData(['camera', 'angle'], e.target.value)}
                            >
                                <option value="">Select...</option>
                                <option value="eye_level">Eye Level</option>
                                <option value="high_angle">High Angle</option>
                                <option value="low_angle">Low Angle</option>
                                <option value="birds_eye">Bird's Eye</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Focal Length</label>
                            <select
                                className={inputClass}
                                value={data.camera.focal_length}
                                onChange={(e) => updateData(['camera', 'focal_length'], e.target.value)}
                            >
                                <option value="">Select...</option>
                                <option value="24mm">24mm (Wide)</option>
                                <option value="35mm">35mm</option>
                                <option value="50mm">50mm (Standard)</option>
                                <option value="85mm">85mm (Portrait)</option>
                                <option value="200mm">200mm (Telephoto)</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Depth of Field</label>
                            <div className="flex gap-1">
                                {['shallow', 'deep'].map(dof => (
                                    <button
                                        key={dof}
                                        onClick={() => updateData(['camera', 'depth_of_field'], dof)}
                                        className={`flex-1 px-2 py-1 text-[9px] font-bold uppercase rounded transition-all ${data.camera.depth_of_field === dof
                                                ? 'bg-monstera-500 text-white shadow-sm'
                                                : 'bg-monstera-50 text-monstera-700 hover:bg-monstera-100'
                                            }`}
                                    >
                                        {dof}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Composition</label>
                            <input
                                type="text"
                                placeholder="e.g., rule of thirds, centered"
                                className={inputClass}
                                value={data.camera.composition}
                                onChange={(e) => updateData(['camera', 'composition'], e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Aesthetic Block */}
            <div className="border border-monstera-200 rounded-md overflow-hidden shadow-sm">
                <SectionHeader section="aesthetic" icon="🎨" title="Aesthetic" />
                {openSections.has('aesthetic') && (
                    <div className="p-3 space-y-2 bg-white">
                        <div>
                            <label className={labelClass}>Medium</label>
                            <select
                                className={inputClass}
                                value={data.aesthetic.medium}
                                onChange={(e) => updateData(['aesthetic', 'medium'], e.target.value)}
                            >
                                <option value="">Select...</option>
                                <option value="photograph">Photograph</option>
                                <option value="painting">Painting</option>
                                <option value="illustration">Illustration</option>
                                <option value="3d_render">3D Render</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Style</label>
                            <input
                                type="text"
                                placeholder="e.g., minimalist, vintage, cinematic"
                                className={inputClass}
                                value={data.aesthetic.style}
                                onChange={(e) => updateData(['aesthetic', 'style'], e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Color Palette</label>
                            <input
                                type="text"
                                placeholder="e.g., warm tones, pastel colors"
                                className={inputClass}
                                value={data.aesthetic.color_palette}
                                onChange={(e) => updateData(['aesthetic', 'color_palette'], e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Mood</label>
                            <input
                                type="text"
                                placeholder="e.g., peaceful, energetic, mysterious"
                                className={inputClass}
                                value={data.aesthetic.mood}
                                onChange={(e) => updateData(['aesthetic', 'mood'], e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Technical Block */}
            <div className="border border-monstera-200 rounded-md overflow-hidden shadow-sm">
                <SectionHeader section="technical" icon="⚙️" title="Technical" />
                {openSections.has('technical') && (
                    <div className="p-3 space-y-2 bg-white">
                        <div>
                            <label className={labelClass}>Quality</label>
                            <input
                                type="text"
                                placeholder="e.g., high detail photorealistic"
                                className={inputClass}
                                value={data.technical.quality}
                                onChange={(e) => updateData(['technical', 'quality'], e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Resolution Hint</label>
                            <input
                                type="text"
                                placeholder="e.g., 8k ultra detailed"
                                className={inputClass}
                                value={data.technical.resolution_hint}
                                onChange={(e) => updateData(['technical', 'resolution_hint'], e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
