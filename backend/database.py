# backend/database.py

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Interview(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    candidate_name = db.Column(db.String(100), nullable=False)
    phone_number = db.Column(db.String(20), nullable=False)
    
    # --- NEW & MODIFIED FIELDS TO SUPPORT THE DASHBOARD ---
    job_position = db.Column(db.String(150), nullable=False)
    job_description = db.Column(db.Text, nullable=False)
    skills_to_assess = db.Column(db.Text, nullable=True)
    
    status = db.Column(db.String(30), default='pending', nullable=False) # e.g., pending -> calling -> analyzing -> completed -> error
    transcript = db.Column(db.Text, nullable=True)
    
    # Fields from Vapi webhook
    duration_in_seconds = db.Column(db.Integer, nullable=True)
    recording_url = db.Column(db.String(500), nullable=True)
    
    # Fields from Gemini analysis
    analysis_summary = db.Column(db.Text, nullable=True)
    analysis_strengths = db.Column(db.Text, nullable=True)
    analysis_concerns = db.Column(db.Text, nullable=True)
    assessment = db.Column(db.Text, nullable=True)
    score = db.Column(db.Integer, nullable=True)
    recommendation = db.Column(db.String(50), nullable=True)

    # Helper function to easily convert the object to a dictionary for JSON responses
    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}