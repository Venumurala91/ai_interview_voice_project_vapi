# backend/app.py

import os
import requests
import json
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
import google.generativeai as genai
from flask_cors import CORS
from sqlalchemy import desc # <-- IMPORT THIS

from database import db, Interview

# --- 1. INITIALIZATION ---
load_dotenv()
app = Flask(__name__, template_folder='../frontend', static_folder='../frontend')
CORS(app)

# --- 2. CONFIGURATION ---
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URI', 'sqlite:///interviews.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# ... (VAPI_API_KEY, GEMINI_API_KEY configuration remains the same) ...
VAPI_API_KEY = os.getenv('VAPI_API_KEY')
VAPI_PHONE_NUMBER_ID = os.getenv('VAPI_PHONE_NUMBER_ID')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel('gemini-1.5-pro-latest') 
else:
    print("ERROR: GEMINI_API_KEY not found. Analysis will fail.")
    gemini_model = None

# --- 3. FRONTEND SERVING ROUTE ---
# We only need one route to serve the main dashboard page now.
@app.route('/')
def index():
    """Serves the main dashboard page."""
    return render_template('index.html')


# --- 4. CORE API ROUTES ---

@app.route('/api/interviews', methods=['GET'])
def list_interviews():
    """API Endpoint to list all interviews, newest first."""
    interviews = Interview.query.order_by(desc(Interview.id)).all()
    return jsonify([i.to_dict() for i in interviews])

@app.route('/api/interviews', methods=['POST'])
def create_interview():
    """API Endpoint to create a new interview record."""
    data = request.json
    required_fields = ['candidate_name', 'phone_number', 'job_position', 'job_description']
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400

    new_interview = Interview(
        candidate_name=data['candidate_name'],
        phone_number=data['phone_number'],
        job_position=data['job_position'],
        job_description=data['job_description'],
        skills_to_assess=data.get('skills_to_assess', '')
    )
    db.session.add(new_interview)
    db.session.commit()
    return jsonify(new_interview.to_dict()), 201

# The start_interview_call endpoint remains the same
@app.route('/api/interviews/<int:interview_id>/start-call', methods=['POST'])
def start_interview_call(interview_id):
    """API Endpoint to trigger the Vapi phone call for an existing interview."""
    interview = Interview.query.get_or_404(interview_id)

    if interview.status != 'pending':
        return jsonify({"error": f"Interview cannot be started. Current status: {interview.status}"}), 409

    interview_prompt = f"""
    You are an AI hiring assistant named 'Eva'. Your goal is to conduct a friendly and professional screening interview.
    - Greet the candidate, '{interview.candidate_name}', by name.
    - State that you are calling for the '{interview.job_position}' role.
    - Based on the job description and the key skills, ask 4-5 relevant questions.
    - The key skills to focus on are: '{interview.skills_to_assess}'.
    - Ask one question at a time and wait for their response.
    - After the last question, thank the candidate and end the call gracefully.
    
    Job Description: "{interview.job_description}"
    """
    
    headers = {'Authorization': f'Bearer {VAPI_API_KEY}'}
    payload = {
        'phoneNumberId': VAPI_PHONE_NUMBER_ID,
        'customer': {'number': interview.phone_number},
        'assistant': {
            'firstMessage': f"Hi {interview.candidate_name}, this is Eva calling for your initial screening interview for the {interview.job_position} role. Is now a good time?",
            'model': {
                'provider': 'google',
                'model': 'gemini-1.5-flash',
                'systemPrompt': interview_prompt
            },
            'voice': {
                'provider': 'vapi',
                'voiceId': 'Neha' 
            },
            'recordingEnabled': True
        },
        'metadata': {'interview_id': interview.id}
    }

    try:
        response = requests.post('https://api.vapi.ai/call/phone', headers=headers, json=payload)
        response.raise_for_status()
        interview.status = 'calling'
        db.session.commit()
        return jsonify(interview.to_dict()), 200 # Return updated interview object
    except requests.exceptions.RequestException as e:
        error_details = f"Failed to start call: {e.response.text if e.response else str(e)}"
        print(f"ERROR: {error_details}")
        interview.status = 'error'
        db.session.commit()
        return jsonify({"error": error_details}), 500

# The webhook and analysis logic remain exactly the same
@app.route('/api/webhook', methods=['POST'])
def vapi_webhook():
    # ... (This function is unchanged)
    payload = request.json
    
    if payload.get('message', {}).get('type') != 'call-end':
        return jsonify({"status": "ignored", "reason": "Not a call-end event"}), 200

    call_data = payload['message']['call']
    interview_id = call_data.get('metadata', {}).get('interview_id')
    if not interview_id:
        return jsonify({"status": "ignored", "reason": "No interview_id in metadata"}), 200

    interview = Interview.query.get(interview_id)
    if not interview:
        return jsonify({"status": "error", "reason": f"Interview ID {interview_id} not found"}), 404

    interview.transcript = call_data.get('transcript')
    interview.duration_in_seconds = payload['message'].get('durationInSeconds')
    interview.recording_url = call_data.get('recordingUrl')
    interview.status = 'analyzing'
    db.session.commit()
    analyze_transcript(interview)
    return jsonify({"status": "received"}), 200

def analyze_transcript(interview):
    # ... (This function is unchanged)
    # ... (It correctly sets status to 'completed' or 'error' at the end)
    if not gemini_model:
        interview.status = 'error'
        interview.analysis_summary = "Error: Gemini model not configured on the server."
        db.session.commit()
        return

    analysis_prompt = f"""
    Analyze the following interview for the '{interview.job_position}' role.
    The candidate was assessed on these skills: '{interview.skills_to_assess}'.

    **Job Description:**
    {interview.job_description}

    **Interview Transcript:**
    {interview.transcript}

    ---
    **Your Task:**
    Generate a JSON object with the following structure. Do NOT include any text, notes, or markdown formatting like ```json outside of the JSON object itself.

    {{
      "summary": "A 2-3 sentence professional summary of the interview.",
      "strengths": "A bulleted list (as a single string using '\\n- ' for new lines) of 2-3 key strengths, referencing the skills assessed.",
      "concerns": "A bulleted list (as a single string using '\\n- ' for new lines) of any concerns or areas for follow-up.",
      "assessment": "A brief evaluation of whether the candidate's answers were correct, relevant, and demonstrated the required skills.",
      "score": "An overall score for the candidate from 0 to 100, based on their performance against the required skills.",
      "recommendation": "A final hiring recommendation. Must be one of: 'Strong Hire', 'Hire', 'Maybe', 'No Hire'."
    }}
    """

    try:
        response = gemini_model.generate_content(analysis_prompt)
        cleaned_text = response.text.strip().replace('```json', '').replace('```', '')
        analysis_data = json.loads(cleaned_text)

        interview.analysis_summary = analysis_data.get('summary')
        interview.analysis_strengths = analysis_data.get('strengths')
        interview.analysis_concerns = analysis_data.get('concerns')
        interview.assessment = analysis_data.get('assessment')
        interview.score = int(analysis_data.get('score', 0))
        interview.recommendation = analysis_data.get('recommendation')
        interview.status = 'completed'

    except (Exception, json.JSONDecodeError) as e:
        print(f"ERROR: Failed Gemini analysis for interview {interview.id}: {e}")
        interview.status = 'error'
        interview.analysis_summary = f"Error during AI analysis. See raw response below.\n\n{response.text}"
    
    db.session.commit()
    print(f"Analysis completed for interview {interview.id}.")


# --- 5. RUN THE APP ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)